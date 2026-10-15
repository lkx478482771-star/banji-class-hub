-- ============================================================================
-- 运动会照片 · Supabase Storage 桶（清晰版照片的落脚点）
--
-- 为什么要有这个桶：
--   class_hub_entries 把「一张照片」当成一条 JSON 记录，单条上限 256 KB
--   （MantleDB 免费档只有 64 KB），于是照片只能压到 480~640 px，放大就糊。
--   照片改用对象存储之后：图片以文件形式存，记录里只留几十字节的路径，
--   网格读缩略图、点开才读原图，清晰度与首屏流量同时解决。
--
-- 用法：Supabase Dashboard → SQL Editor → 整段粘贴 → Run。可重复执行（幂等）。
--       跑完再按 README「迁到 Supabase（怎么操作）」里的步骤填 config.js。
--
-- ⚠️ 与第一阶段同级：anon 可读可写（班级站本来是公开投稿、事后删的管理方式）。
--    真正的权限边界要等接入 Supabase Auth 之后才立得起来。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 建桶：公开读（<img src> 直接能用）、匿名可写，单文件 2 MB、只收图片。
-- 上传时会自动压到 1.5 MB 以内（见 photo-store.js），这里只是服务端兜底。
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sports-photos',
  'sports-photos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 行级权限：只开放 sports-photos 这一个桶，别的桶不受影响。
-- 刻意不给 update —— 照片传上去就只读，改说明只改数据库里那条记录。
-- ---------------------------------------------------------------------------
drop policy if exists sports_photos_read on storage.objects;
create policy sports_photos_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'sports-photos');

drop policy if exists sports_photos_insert on storage.objects;
create policy sports_photos_insert
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'sports-photos');

drop policy if exists sports_photos_delete on storage.objects;
create policy sports_photos_delete
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'sports-photos');

-- ---------------------------------------------------------------------------
-- 收尾自检：应该看到 sports-photos / true / 1048576 一行，加三个策略。
-- ---------------------------------------------------------------------------
select
  (select count(*) from storage.buckets where id = 'sports-photos') as bucket,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'sports_photos_%') as policies;
