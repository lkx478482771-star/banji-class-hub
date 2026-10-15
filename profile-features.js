function profilePatchCurrentAccount(patch) {
  const key = localUsernameKey(authState.session?.username || "");
  const accounts = getLocalAccounts();
  const index = accounts.findIndex((account) => account.usernameKey === key);
  if (index < 0) {
    showToast("账号资料暂不可用", "请重新登录后再保存个人设置。");
    return false;
  }
  const account = { ...accounts[index], ...patch, updatedAt: new Date().toISOString() };
  accounts[index] = account;
  saveLocalAccounts(accounts);
  Object.assign(authState.session, patch);
  saveAuthSession(authState.session);
  ui.members = ui.members.map((member) => member.usernameKey === key ? { ...member, ...patch } : member);
  if (hasSharedConfig()) {
    void writeRemoteAccount(account).then(() => {
      ui.membersLoaded = false;
      void loadMemberDirectory(true);
    }).catch(() => showToast("已保存到本机", "网络恢复后再登录即可同步到班级。"));
  }
  return true;
}
function sportsAthleteAccount(athlete) {
  const key = localUsernameKey(athlete?.name || "");
  if (!key) return null;
  if (key === localUsernameKey(authState.session?.username || "")) return currentAccountRecord();
  return ui.members.find((member) => member.usernameKey === key) || null;
}
function isOwnSportsAthlete(athlete) {
  return Boolean(authState.session && localUsernameKey(authState.session.username) === localUsernameKey(athlete?.name || ""));
}
function sportsLookFor(athlete) {
  const base = posterLook(athlete);
  const saved = sportsAthleteAccount(athlete)?.sportsLook || {};
  const styles = base.female ? POSTER_GIRL_STYLES : POSTER_BOY_STYLES;
  return {
    ...base,
    skin: POSTER_SKINS.includes(saved.skin) ? saved.skin : base.skin,
    hair: POSTER_HAIRS.includes(saved.hair) ? saved.hair : base.hair,
    wear: POSTER_WEARS.includes(saved.wear) ? saved.wear : base.wear,
    style: styles.includes(saved.style) ? saved.style : base.style
  };
}
function sportsLookEditor(athlete, index) {
  if (!isOwnSportsAthlete(athlete)) {
    return '<p class="sports-avatar-note">' +
      (sportsAthleteAccount(athlete) ? "已与同名账号绑定" : "与账号同名时自动绑定") +
      " · 仅本人可以更改形象</p>";
  }
  const look = sportsLookFor(athlete);
  const skinNames = ["暖杏", "浅棕", "蜜糖", "奶油", "麦色"];
  const hairNames = ["墨黑", "栗棕", "深棕", "蓝黑", "焦糖", "乌黑"];
  const wearNames = ["薄荷绿", "天蓝", "薰衣紫", "珊瑚粉", "翠绿", "活力黄"];
  const styleValues = look.female ? POSTER_GIRL_STYLES : POSTER_BOY_STYLES;
  const styleNames = look.female ? ["齐耳短发", "高马尾", "双马尾", "微卷长发"] : ["清爽短发", "蓬松短发", "侧分短发"];
  const options = (values, names, selected) => values.map((value, i) =>
    '<option value="' + value + '"' + (value === selected ? " selected" : "") + ">" +
    (names[i] || value) + "</option>").join("");
  const field = (key, label, values, names, selected) =>
    '<label class="sports-look-field"><span>' + label + '</span><select data-sports-look="' +
    key + '" data-index="' + index + '">' + options(values, names, selected) + "</select></label>";
  return '<div class="sports-look-editor"><strong>自定义我的运动员形象</strong><div class="sports-look-grid">' +
    field("skin", "肤色", POSTER_SKINS, skinNames, look.skin) +
    field("hair", "发色", POSTER_HAIRS, hairNames, look.hair) +
    field("wear", "队服", POSTER_WEARS, wearNames, look.wear) +
    field("style", "发型", styleValues, styleNames, look.style) +
    '</div><p class="sports-avatar-note">更改会同步到账号，并用于运动员预览和专属海报。</p></div>';
}
async function compressProfileAvatar(file) {
  if (!file || !file.type.startsWith("image/")) throw new Error("请选择图片文件。");
  if (file.size > 10 * 1024 * 1024) throw new Error("图片需要小于 10 MB。");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("图片读取失败，请换一张图片。"));
      image.src = url;
    });
    const side = 256;
    const crop = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器无法处理图片。");
    ctx.drawImage(image, (image.naturalWidth-crop)/2, (image.naturalHeight-crop)/2, crop, crop, 0, 0, side, side);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
    if (dataUrl.length > 80000) throw new Error("压缩后的图片仍然过大，请换一张图片。");
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function handleProfileAvatarChange(event) {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const avatarDataUrl = await compressProfileAvatar(file);
    if (profilePatchCurrentAccount({ avatarDataUrl })) {
      render();
      showToast("头像已更新", "成员目录和顶部账号栏都会显示新头像。");
    }
  } catch (error) {
    showToast("头像设置失败", error.message || "请换一张图片后重试。");
  } finally {
    input.value = "";
  }
}
async function saveOwnSportsLook(index, field, value) {
  const athlete = SPORTS_ATHLETES[index];
  if (!athlete || !isOwnSportsAthlete(athlete)) {
    showToast("只能修改自己的运动员形象", "账号用户名需与运动员姓名一致。");
    return;
  }
  const base = sportsLookFor(athlete);
  const allowed = { skin: POSTER_SKINS, hair: POSTER_HAIRS, wear: POSTER_WEARS, style: base.female ? POSTER_GIRL_STYLES : POSTER_BOY_STYLES };
  if (!allowed[field]?.includes(value)) return;
  if (!profilePatchCurrentAccount({ sportsLook: { ...base, [field]: value } })) return;
  selectSportsAthlete(index);
  showToast("运动员形象已更新", "预览和之后生成的专属海报会使用新形象。");
}

/* ==== 选手海报：用 canvas 现画一张竖版图，存下来就能直接发群里 ==== */
const SPORTS_POSTER_W = 1080;
const SPORTS_POSTER_H = 1620;
const SPORTS_POSTER_INK = "#0d2f25";
const SPORTS_POSTER_SOFT = "#5b7d71";
const SPORTS_POSTER_MINT = "#0e9a70";
const SPORTS_POSTER_GOLD = "#d9870f";
const SPORTS_POSTER_LINE = "rgba(18, 130, 95, 0.28)";

const posterFont = (size, weight) =>
  `${weight || 700} ${size}px "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", system-ui, sans-serif`;

function posterRoundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function posterDash(ctx, x1, y1, x2, y2) {
  ctx.save();
  ctx.setLineDash([12, 12]);
  ctx.strokeStyle = SPORTS_POSTER_LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// 中文按字断行就够了，不用去猜西文的词边界。
function posterWrap(ctx, text, maxWidth, size, weight) {
  ctx.font = posterFont(size, weight);
  const lines = [];
  let line = "";
  String(text)
    .split("")
    .forEach((char) => {
      const next = line + char;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line = next;
      }
    });
  if (line) lines.push(line);
  return lines;
}

function posterKindText(kind) {
  if (kind === "field") return "田赛";
  if (kind === "both") return "径赛 · 田赛";
  return "径赛";
}

/* ==== 选手形象：按性别定发型，按姓名定肤色/发色/球衣，每人一张不重样的「芯片小人」 ==== */
const POSTER_SKINS = ["#f7d5b6", "#f0c5a2", "#e6b28a", "#fbe2cc", "#dfa980"];
const POSTER_HAIRS = ["#2a2e37", "#3b2a21", "#4b3527", "#1d2230", "#5b3c2b", "#12161d"];
const POSTER_WEARS = ["#3ddcb4", "#38bdf8", "#a78bfa", "#fb7185", "#34d399", "#fbbf24"];
const POSTER_GIRL_STYLES = ["bob", "pony", "twin", "wave"];
const POSTER_BOY_STYLES = ["short", "spiky", "parted"];

function posterSeed(text) {
  let seed = 2166136261;
  const raw = String(text);
  for (let i = 0; i < raw.length; i += 1) {
    seed ^= raw.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function posterLook(athlete) {
  const seed = posterSeed(`${athlete.name}|${athlete.group}`);
  const female = /女/.test(athlete.group || "");
  return {
    female,
    skin: POSTER_SKINS[seed % POSTER_SKINS.length],
    hair: POSTER_HAIRS[(seed >>> 4) % POSTER_HAIRS.length],
    wear: POSTER_WEARS[(seed >>> 9) % POSTER_WEARS.length],
    style: female ? POSTER_GIRL_STYLES[(seed >>> 14) % POSTER_GIRL_STYLES.length] : POSTER_BOY_STYLES[(seed >>> 14) % POSTER_BOY_STYLES.length]
  };
}

// 以 (cx, cy) 为圆心、r 为半径画一张头像；海报和页面预览都用它，保证长得一样。
function drawPosterAvatar(ctx, athlete, index, cx, cy, r) {
  const look = window.BANJI_PROFILE_FEATURES_READY ? window.sportsLookFor(athlete) : posterLook(athlete);
  const headR = r * 0.4;
  const headY = cy - r * 0.1;
  const bodyTop = headY + headR * 0.7;
  const bodyW = r * 1.3;

  ctx.save();
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const dish = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  dish.addColorStop(0, "#ffffff");
  dish.addColorStop(1, "#dcf3e7");
  ctx.fillStyle = dish;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  const halo = ctx.createRadialGradient(cx, cy - r * 0.25, r * 0.1, cx, cy, r * 1.1);
  halo.addColorStop(0, "rgba(18, 185, 129, 0.20)");
  halo.addColorStop(1, "rgba(18, 185, 129, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // 女生的长发先铺在头后面
  if (look.female) {
    ctx.fillStyle = look.hair;
    if (look.style === "twin") {
      [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.ellipse(cx + side * headR * 1.3, headY + headR * 0.78, headR * 0.46, headR * 1.15, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (look.style === "pony") {
      ctx.beginPath();
      ctx.ellipse(cx + headR * 1.28, headY + headR * 0.55, headR * 0.42, headR * 1.05, -0.3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(cx, headY + headR * 0.62, headR * 1.32, headR * 1.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 球衣
  ctx.beginPath();
  ctx.moveTo(cx - bodyW / 2, cy + r * 1.1);
  ctx.quadraticCurveTo(cx - bodyW / 2, bodyTop + r * 0.05, cx - bodyW * 0.22, bodyTop);
  ctx.lineTo(cx + bodyW * 0.22, bodyTop);
  ctx.quadraticCurveTo(cx + bodyW / 2, bodyTop + r * 0.05, cx + bodyW / 2, cy + r * 1.1);
  ctx.closePath();
  ctx.fillStyle = look.wear;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx, bodyTop, headR * 0.52, headR * 0.24, 0, 0, Math.PI);
  ctx.fillStyle = "rgba(18, 110, 80, 0.20)";
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(14, 122, 88, 0.85)";
  ctx.font = posterFont(Math.round(r * 0.3), 800);
  ctx.fillText(String(index + 1).padStart(2, "0"), cx, cy + r * 0.64);

  // 头 + 耳朵
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fillStyle = look.skin;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - headR * 0.98, headY + headR * 0.14, headR * 0.19, 0, Math.PI * 2);
  ctx.arc(cx + headR * 0.98, headY + headR * 0.14, headR * 0.19, 0, Math.PI * 2);
  ctx.fillStyle = look.skin;
  ctx.fill();

  // 头发
  ctx.fillStyle = look.hair;
  if (look.female) {
    ctx.beginPath();
    ctx.arc(cx, headY, headR * 1.1, Math.PI * 0.96, Math.PI * 2.04);
    ctx.lineTo(cx + headR * 1.1, headY + headR * (look.style === "pony" || look.style === "twin" ? 0.3 : 0.62));
    ctx.lineTo(cx - headR * 1.1, headY + headR * (look.style === "pony" || look.style === "twin" ? 0.3 : 0.62));
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, headY - headR * 0.34, headR * 1.04, headR * 0.5, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(cx, headY - headR * 0.06, headR * 1.06, Math.PI * 1.02, Math.PI * 1.98);
    ctx.lineTo(cx + headR * 0.92, headY - headR * 0.3);
    ctx.lineTo(cx - headR * 0.92, headY - headR * 0.3);
    ctx.closePath();
    ctx.fill();
    if (look.style === "spiky") {
      ctx.beginPath();
      ctx.moveTo(cx - headR * 0.55, headY - headR * 0.72);
      ctx.lineTo(cx - headR * 0.18, headY - headR * 1.18);
      ctx.lineTo(cx + headR * 0.02, headY - headR * 0.63);
      ctx.lineTo(cx + headR * 0.38, headY - headR * 1.08);
      ctx.lineTo(cx + headR * 0.72, headY - headR * 0.36);
      ctx.closePath();
      ctx.fill();
    } else if (look.style === "parted") {
      ctx.beginPath();
      ctx.moveTo(cx + headR * 0.12, headY - headR * 0.92);
      ctx.quadraticCurveTo(cx + headR * 0.35, headY - headR * 0.55, cx + headR * 0.82, headY - headR * 0.48);
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = Math.max(2, headR * 0.08);
      ctx.stroke();
    }
  }

  // 眼睛
  const eyeY = headY + headR * 0.14;
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.ellipse(cx + side * headR * 0.38, eyeY, headR * 0.11, headR * 0.15, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#16202e";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + side * headR * 0.38 + headR * 0.04, eyeY - headR * 0.05, headR * 0.04, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fill();
  });

  if (look.female) {
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.ellipse(cx + side * headR * 0.62, headY + headR * 0.44, headR * 0.18, headR * 0.11, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(244, 138, 150, 0.42)";
      ctx.fill();
    });
  }

  ctx.beginPath();
  ctx.arc(cx, headY + headR * 0.36, headR * 0.24, Math.PI * 0.16, Math.PI * 0.84);
  ctx.strokeStyle = "#a24a52";
  ctx.lineWidth = Math.max(2, headR * 0.09);
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.restore();

  // 外圈 + 一圈引脚，看着像颗芯片
  ctx.strokeStyle = "rgba(18, 185, 129, 0.7)";
  ctx.lineWidth = Math.max(2, r * 0.045);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(18, 185, 129, 0.45)";
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * r * 1.1, cy + Math.sin(angle) * r * 1.1);
    ctx.rotate(angle);
    posterRoundRect(ctx, -r * 0.055, -r * 0.035, r * 0.11, r * 0.07, r * 0.02);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

// 页面上的小预览：把同一张头像画成 data URL，直接塞进 <img>。
function sportsAvatarUrl(athlete, index) {
  const size = 320;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  drawPosterAvatar(ctx, athlete, index, size / 2, size / 2, size * 0.43);
  return canvas.toDataURL("image/png");
}

function drawSportsPoster(index) {
  const athlete = SPORTS_ATHLETES[index];
  if (!athlete) return null;
  const canvas = document.createElement("canvas");
  canvas.width = SPORTS_POSTER_W;
  canvas.height = SPORTS_POSTER_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const W = SPORTS_POSTER_W;
  const H = SPORTS_POSTER_H;
  const pad = 84;
  const id = sportsAthleteId(index);

  const bg = ctx.createLinearGradient(0, 0, W * 0.5, H);
  bg.addColorStop(0, "#e6f5ff");
  bg.addColorStop(0.5, "#eefaf1");
  bg.addColorStop(1, "#fff7ea");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(18, 130, 95, 0.07)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 54) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 54) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
  }

  // 右上角那圈同心圆 = 晶圆
  ctx.save();
  ctx.strokeStyle = "rgba(18, 185, 129, 0.22)";
  ctx.lineWidth = 2;
  for (let r = 70; r <= 420; r += 66) {
    ctx.beginPath();
    ctx.arc(W - 30, 60, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  const glow = ctx.createRadialGradient(W / 2, H + 60, 30, W / 2, H + 60, 640);
  glow.addColorStop(0, "rgba(255, 206, 92, 0.5)");
  glow.addColorStop(1, "rgba(255, 206, 92, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, H - 700, W, 700);

  ctx.textAlign = "left";
  ctx.fillStyle = SPORTS_POSTER_SOFT;
  ctx.font = posterFont(34, 600);
  ctx.fillText("安徽大学 · 集成电路学院", pad, 152);
  ctx.fillStyle = SPORTS_POSTER_MINT;
  ctx.font = posterFont(30, 700);
  ctx.fillText("IC-4 运动会 · 出战名单", pad, 202);

  const cardX = pad;
  const cardY = 282;
  const cardW = W - pad * 2;
  const cardH = 1080;
  posterRoundRect(ctx, cardX, cardY, cardW, cardH, 40);
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.fill();
  ctx.strokeStyle = "rgba(18, 130, 95, 0.18)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.save();
  posterRoundRect(ctx, cardX, cardY, cardW, cardH, 40);
  ctx.clip();
  const bar = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0);
  bar.addColorStop(0, SPORTS_POSTER_MINT);
  bar.addColorStop(0.55, "#38bdf8");
  bar.addColorStop(1, SPORTS_POSTER_GOLD);
  ctx.fillStyle = bar;
  ctx.fillRect(cardX, cardY, cardW, 8);
  ctx.restore();

  ctx.font = posterFont(38, 700);
  const idWidth = ctx.measureText(id).width + 60;
  posterRoundRect(ctx, cardX + cardW - 48 - idWidth, cardY + 54, idWidth, 68, 34);
  ctx.fillStyle = "rgba(240, 147, 43, 0.14)";
  ctx.fill();
  ctx.strokeStyle = "rgba(240, 147, 43, 0.7)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = SPORTS_POSTER_GOLD;
  ctx.textAlign = "center";
  ctx.fillText(id, cardX + cardW - 48 - idWidth / 2, cardY + 100);

  ctx.textAlign = "left";
  ctx.fillStyle = SPORTS_POSTER_SOFT;
  ctx.font = posterFont(30, 600);
  ctx.fillText("DATASHEET / Rev.1.0", cardX + 48, cardY + 100);

  // 专属形象
  drawPosterAvatar(ctx, athlete, index, cardX + cardW - 178, cardY + 300, 138);

  // 名字太长就自动收字号，保证不越框
  let nameSize = 136;
  ctx.font = posterFont(nameSize, 800);
  while (nameSize > 76 && ctx.measureText(athlete.name).width > cardW - 96) {
    nameSize -= 6;
    ctx.font = posterFont(nameSize, 800);
  }
  ctx.fillStyle = SPORTS_POSTER_INK;
  ctx.fillText(athlete.name, cardX + 48, cardY + 300);

  ctx.fillStyle = SPORTS_POSTER_MINT;
  ctx.fillRect(cardX + 48, cardY + 338, 132, 8);

  ctx.fillStyle = SPORTS_POSTER_SOFT;
  ctx.font = posterFont(34, 600);
  ctx.fillText(
    `${athlete.group} · ${posterKindText(athlete.kind)} · ${athlete.events.length} 项`,
    cardX + 48,
    cardY + 406
  );

  posterDash(ctx, cardX + 48, cardY + 452, cardX + cardW - 48, cardY + 452);

  ctx.fillStyle = SPORTS_POSTER_SOFT;
  ctx.font = posterFont(26, 700);
  ctx.fillText("EVENT / 参赛项目", cardX + 48, cardY + 508);

  ctx.font = posterFont(32, 600);
  const chipRight = cardX + cardW - 48;
  let chipX = cardX + 48;
  let chipY = cardY + 574;
  athlete.events.forEach((event) => {
    const width = ctx.measureText(event).width + 52;
    if (chipX + width > chipRight) {
      chipX = cardX + 48;
      chipY += 78;
    }
    posterRoundRect(ctx, chipX, chipY - 46, width, 66, 33);
    ctx.fillStyle = "rgba(18, 185, 129, 0.10)";
    ctx.fill();
    ctx.strokeStyle = "rgba(18, 185, 129, 0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = SPORTS_POSTER_INK;
    ctx.fillText(event, chipX + 26, chipY);
    chipX += width + 16;
  });

  const cheerY = cardY + 700;
  const cheerLines = posterWrap(ctx, athlete.cheer || "信号满格，等你冲线。", cardW - 160, 36, 600);
  const cheerH = 56 + cheerLines.length * 54;
  posterRoundRect(ctx, cardX + 48, cheerY, cardW - 96, cheerH, 30);
  ctx.fillStyle = "rgba(18, 185, 129, 0.10)";
  ctx.fill();
  ctx.strokeStyle = "rgba(18, 185, 129, 0.42)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#0e7a58";
  ctx.font = posterFont(36, 600);
  cheerLines.forEach((text, i) => {
    ctx.fillText(text, cardX + 80, cheerY + 74 + i * 54);
  });

  const specs = [
    ["GROUP", athlete.group],
    ["POWER SUPPLY", SPORTS_MEET.supply],
    ["LOT", SPORTS_MEET.meetTime.slice(0, 10)],
    ["STATUS", "已通电 / READY"]
  ];
  const specTop = cheerY + cheerH + 62;
  specs.forEach((pair, i) => {
    const y = specTop + i * 62;
    ctx.font = posterFont(26, 700);
    ctx.fillStyle = SPORTS_POSTER_SOFT;
    ctx.textAlign = "left";
    ctx.fillText(pair[0], cardX + 48, y);
    ctx.font = posterFont(30, 600);
    ctx.fillStyle = SPORTS_POSTER_INK;
    ctx.textAlign = "right";
    ctx.fillText(pair[1], cardX + cardW - 48, y);
    if (i < specs.length - 1) posterDash(ctx, cardX + 48, y + 24, cardX + cardW - 48, y + 24);
  });

  ctx.textAlign = "left";
  ctx.fillStyle = SPORTS_POSTER_INK;
  ctx.font = posterFont(34, 700);
  ctx.fillText(SPORTS_MEET.dateLabel, pad, 1478);
  ctx.fillStyle = SPORTS_POSTER_MINT;
  ctx.font = posterFont(30, 600);
  ctx.fillText(SPORTS_MEET.slogan, pad, 1532);
  ctx.fillStyle = "rgba(91, 125, 113, 0.85)";
  ctx.font = posterFont(26, 600);
  ctx.fillText(
    `集成电路 4 班 · 班级共建站　|　${id} · ${SPORTS_ATHLETES.length} 颗芯片之一`,
    pad,
    1582
  );

  return canvas;
}

function downloadSportsPoster(index) {
  const asked = Number(index);
  const at = Number.isInteger(asked) && SPORTS_ATHLETES[asked] ? asked : sportsUi.selected;
  const athlete = SPORTS_ATHLETES[at];
  if (!athlete) return;
  const canvas = drawSportsPoster(at);
  if (!canvas || !canvas.toBlob) {
    showToast("海报没生成出来", "换 Chrome 或 Edge 再试一次。");
    return;
  }
  const fileName = `${sportsAthleteId(at)}-${athlete.name}-运动会海报.jpg`;
  // 竖版大图用 JPEG 更划算：PNG 要 1.7 MB，JPEG 0.95 只要几百 KB，发群里更快。
  canvas.toBlob(
    (blob) => {
      if (!blob) {
        showToast("海报没生成出来", "换 Chrome 或 Edge 再试一次。");
        return;
      }
      saveBlob(blob, fileName);
      showToast("海报已下载", `${athlete.name} 的海报存成了 ${fileName}，直接发群里就行。`);
    },
    "image/jpeg",
    0.95
  );
}


window.sportsAvatarUrl = sportsAvatarUrl;
window.downloadSportsPoster = downloadSportsPoster;
window.isOwnSportsAthlete = isOwnSportsAthlete;
window.BANJI_PROFILE_FEATURES_READY = true;
window.profilePatchCurrentAccount = profilePatchCurrentAccount;
window.sportsLookFor = sportsLookFor;
window.sportsLookEditor = sportsLookEditor;
window.handleProfileAvatarChange = handleProfileAvatarChange;
window.saveOwnSportsLook = saveOwnSportsLook;
if (authState.session && (ui.page === "sports" || ui.page === "profile")) render();
