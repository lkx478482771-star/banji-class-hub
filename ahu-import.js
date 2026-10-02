(() => {
  const marker = "BANJI_AHU_IMPORT_RUNNING";
  if (window[marker]) return;
  window[marker] = true;

  const script = document.currentScript;
  const params = new URL(script?.src || location.href).searchParams;
  const ownerId = params.get("owner");
  const classId = params.get("class") || "ahu-ic-2026";
  const namespace = params.get("namespace");

  if (!ownerId || !namespace) {
    alert("班集课表导入参数不完整，请返回班集重新复制代码。");
    window[marker] = false;
    return;
  }

  const token = new URLSearchParams(location.search).get("idToken");
  if (!token) {
    alert("没有检测到教务登录令牌。请先通过安徽大学课表页面打开此页面，再运行更新代码。");
    window[marker] = false;
    return;
  }

  const apiBase = "https://jwapp.ahu.edu.cn/eams-micro-server/api/v1";
  const storageBase = `https://mantledb.sh/v2/${namespace}`;
  const headers = {
    "X-Id-Token": token,
    Authorization: token,
    userToken: token,
    Accept: "application/json"
  };

  const request = async (path) => {
    const response = await fetch(`${apiBase}${path}`, { headers });
    if (!response.ok) throw new Error(`教务接口请求失败：${response.status}`);
    const payload = await response.json();
    return payload.data;
  };

  const formatSchedule = (semester, lessons, existing) => {
    const importedCourses = lessons.map((lesson) => ({
      id: String(lesson.id),
      code: lesson.course?.code || "",
      name: lesson.course?.nameZh || "未命名课程",
      nameEn: lesson.course?.nameEn || "",
      credits: lesson.course?.credits ?? null,
      teachers: lesson.teacherAssignmentList || [],
      type: lesson.courseType?.nameZh || "",
      scheduleText: lesson.scheduleText?.dateTimePlacePersonText?.text || "",
      campus: lesson.campus?.nameZh || ""
    }));

    const importedSessions = [];
    for (const lesson of lessons) {
      for (const session of lesson.schedules || []) {
        importedSessions.push({
          courseId: String(lesson.id),
          courseCode: lesson.course?.code || "",
          courseName: lesson.course?.nameZh || "未命名课程",
          weekday: session.weekday,
          weekIndex: session.weekIndex,
          date: session.date,
          startUnit: session.startUnit,
          endUnit: session.endUnit,
          startTime: session.startTime,
          endTime: session.endTime,
          teacher: session.teacherName || "",
          room: session.room?.nameZh || session.customPlace || "",
          campus: lesson.campus?.nameZh || "",
          lessonType: session.lessonType || "",
          state: session.state || ""
        });
      }
    }

    const manualCourses = (existing?.courses || []).filter((course) =>
      String(course.id || "").startsWith("manual-")
    );
    const manualIds = new Set(manualCourses.map((course) => String(course.id)));
    const manualSessions = (existing?.sessions || []).filter((session) =>
      manualIds.has(String(session.courseId))
    );
    const startDate = new Date(`${semester.startDate}T00:00:00`);
    const currentWeek = Math.max(
      1,
      Math.floor((Date.now() - startDate.getTime()) / 604800000) + 1
    );

    return {
      version: 1,
      ownerId,
      classId,
      source: "安徽大学教务系统",
      semester: {
        id: semester.id,
        code: semester.code,
        name: semester.nameZh,
        startDate: semester.startDate,
        endDate: semester.endDate,
        weekCount: semester.weekIndices?.length || 20
      },
      currentWeek: Math.min(currentWeek, semester.weekIndices?.length || currentWeek),
      courses: [...importedCourses, ...manualCourses],
      sessions: [...importedSessions, ...manualSessions],
      autoUpdate: true,
      intervalHours: 24,
      importedAt: existing?.importedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  };

  (async () => {
    try {
      const semester = await request("/lesson/student/current-semester");
      const [lessons, existing] = await Promise.all([
        request(`/lesson/student/course-table/${semester.id}`),
        fetch(`${storageBase}/schedules/${encodeURIComponent(ownerId)}`)
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null)
      ]);

      const schedule = formatSchedule(semester, lessons, existing);
      const response = await fetch(
        `${storageBase}/schedules/${encodeURIComponent(ownerId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(schedule)
        }
      );
      if (!response.ok) throw new Error(`课表保存失败：${response.status}`);
      alert(
        `班集课表已更新：${schedule.courses.length} 门课程，第 ${schedule.currentWeek} 周。`
      );
    } catch (error) {
      alert(`班集课表更新失败：${error.message}`);
    } finally {
      window[marker] = false;
    }
  })();
})();
