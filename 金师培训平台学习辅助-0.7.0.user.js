// ==UserScript==
// @name         金师培训平台学习辅助
// @namespace    https://jinshi.enetedu.com/
// @version      0.7.0
// @description  自动检测登录状态，登录后遍历全部课程自动学习；浏览器切后台不中断，视频结束后自动连播下一部
// @author       Codex
// @match        https://jinshi.enetedu.com/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  // ============ 配置 ============
  const API = {
    base: '/admin-api/media/online-course',
    courseList: '/admin-api/media/online-course/getUserLearingCoursList',
    courseListSign: '/admin-api/media/online-course/getUserLearingCoursListget',

    // 课时 API：第一个已验证可用，后面是候选
    lessonEndpoints: [
      '/admin-api/course/learning-detail/treeList',
      '/admin-api/media/online-course/learning-detail/treeList',
      '/admin-api/media/online-course/course/lesson/list',
      '/admin-api/media/online-course/getChapterList',
    ],
  };

  const PAGE = {
    login: '/login',
    myCourse: '/site/personalCenter/MyCourse',
    studyCenter: '/site/personalCenter',
    learningPrefix: '/courseLearning',
  };

  // ============ 状态 ============
  const STATE = {
    panelId: 'codex-jinshi-helper',
    courseId: '',
    lessons: [],
    currentId: '',
    currentLesson: null,
    currentIndex: -1,
    nextLesson: null,
    video: null,
    countdownTimer: null,
    countdownLeft: 0,
    changingLesson: false,
    lastSrc: '',
    lastEndedSrc: '',
    statusText: '正在识别...',
    autoNext: localStorage.getItem('codexJinshiAutoNext') !== '0',
    autoPlay: localStorage.getItem('codexJinshiAutoPlay') !== '0',
    mutedStart: localStorage.getItem('codexJinshiMutedStart') !== '0',

    // 页面类型
    pathname: location.pathname,
    isLearningPage: location.pathname.indexOf('/courseLearning') > -1,
    isMyCoursePage: location.pathname.indexOf('/MyCourse') > -1,
    isLoginPage: location.pathname.indexOf('/login') > -1,

    // 跨课程
    myCourses: [],
    courseListClicked: false,
    _courseListLoading: false,
    courseDoneCount: parseInt(localStorage.getItem('codexJinshiDoneCount') || '0'),
    lessonApiPath: '',
    _startClicked: false,
    _pausedByVisibility: false,
  };

  const CROSS = {
    doneKey: 'codexJinshiCourseDone',
    idxKey: 'codexJinshiCourseIdx',
  };

  // ============ 工具函数 ============
  const addStyle = typeof GM_addStyle === 'function'
    ? GM_addStyle
    : (css) => {
        const style = document.createElement('style');
        style.textContent = css;
        const parent = document.head || document.documentElement;
        if (parent) parent.appendChild(style);
        else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style), { once: true });
      };

  addStyle(`
    #${STATE.panelId} {
      position: fixed; right: 18px; bottom: 18px; z-index: 2147483647;
      width: 286px; padding: 12px; color: #172026;
      background: rgba(255,255,255,0.97);
      border: 1px solid rgba(20,31,43,0.16); border-radius: 8px;
      box-shadow: 0 12px 34px rgba(15,23,42,0.18);
      font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
    }
    #${STATE.panelId} .cx-title {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 8px; font-weight: 700;
    }
    #${STATE.panelId} .cx-status {
      min-height: 38px; color: #3b4a54; word-break: break-word;
    }
    #${STATE.panelId} .cx-grid {
      display: grid; gap: 6px; margin-top: 10px; padding: 9px;
      background: #f6f8f9; border: 1px solid #e3e8ec; border-radius: 6px;
    }
    #${STATE.panelId} .cx-line {
      display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 8px; align-items: start;
    }
    #${STATE.panelId} .cx-label { color: #6a767e; }
    #${STATE.panelId} .cx-value {
      min-width: 0; color: #172026; font-weight: 600;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #${STATE.panelId} .cx-progress {
      height: 6px; overflow: hidden; background: #dfe7ea; border-radius: 999px;
    }
    #${STATE.panelId} .cx-progress-fill {
      width: 0%; height: 100%; background: #176b5b; transition: width .25s ease;
    }
    #${STATE.panelId} .cx-row {
      display: flex; align-items: center; gap: 8px; margin-top: 8px; color: #46545d;
    }
    #${STATE.panelId} .cx-actions {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;
    }
    #${STATE.panelId} button {
      min-height: 32px; padding: 7px 9px; color: #fff; background: #176b5b;
      border: 0; border-radius: 6px; cursor: pointer; font-weight: 700;
    }
    #${STATE.panelId} button.secondary { color: #176b5b; background: #eaf5f2; }
    #${STATE.panelId} button:disabled { cursor: not-allowed; opacity: 0.45; }
    #${STATE.panelId} .cx-close {
      width: 24px; min-height: 24px; padding: 0; color: #48545c;
      background: transparent; font-size: 18px; line-height: 1;
    }
    #${STATE.panelId} input[type="checkbox"] { width: 14px; height: 14px; margin: 0; }
    #${STATE.panelId} kbd {
      padding: 1px 5px; border: 1px solid #b8c1c8; border-bottom-width: 2px;
      border-radius: 4px; background: #f6f8f9;
      font: 12px/1.2 ui-monospace, SFMono-Regular, Consolas, monospace;
    }
  `);

  function log(msg) { console.log('[金师助手] ' + msg); }

  function getParams() { return new URLSearchParams(location.search); }

  function getCookie(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : '';
  }

  function isLoggedIn() {
    return !!getCookie('eneteduToken');
  }

  function visible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  function setStatus(msg) {
    STATE.statusText = msg;
    if (STATE.isMyCoursePage || (!STATE.isLearningPage && !STATE.isLoginPage)) {
      renderCourseListPanel();
    } else if (STATE.isLearningPage) {
      renderPanel();
    }
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function playbackText(video) {
    if (!video) return '未找到视频';
    if (video.ended) return '已结束';
    if (video.paused) return '暂停中';
    if (video.seeking) return '定位中';
    if (video.readyState < 2) return '加载中';
    return '播放中';
  }

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============ 面板 ============
  function ensurePanel() {
    let panel = document.getElementById(STATE.panelId);
    if (panel) return panel;

    panel = document.createElement('section');
    panel.id = STATE.panelId;
    panel.innerHTML = `
      <div class="cx-title">
        <span>学习辅助</span>
        <button class="cx-close" type="button" title="隐藏">x</button>
      </div>
      <div class="cx-status">正在识别...</div>
      <div class="cx-grid">
        <div class="cx-line"><span class="cx-label">当前</span><span class="cx-value cx-current">识别中</span></div>
        <div class="cx-line"><span class="cx-label">下一部</span><span class="cx-value cx-next-name">识别中</span></div>
        <div class="cx-line"><span class="cx-label">状态</span><span class="cx-value cx-play-state">未找到视频</span></div>
        <div class="cx-line"><span class="cx-label">声音</span><span class="cx-value cx-audio-state">--</span></div>
        <div class="cx-line"><span class="cx-label">进度</span><span class="cx-value cx-progress-text">--:-- / --:--</span></div>
        <div class="cx-progress"><div class="cx-progress-fill"></div></div>
        <div class="cx-line"><span class="cx-label">课时</span><span class="cx-value cx-count">--</span></div>
        <div class="cx-line"><span class="cx-label">倒计时</span><span class="cx-value cx-countdown">--</span></div>
      </div>
      <label class="cx-row">
        <input class="cx-auto-next" type="checkbox">
        <span>视频结束后自动下一部</span>
      </label>
      <label class="cx-row">
        <input class="cx-auto-play" type="checkbox">
        <span>进入课时后尝试播放</span>
      </label>
      <label class="cx-row">
        <input class="cx-muted-start" type="checkbox">
        <span>被拦截时静音启动</span>
      </label>
      <div class="cx-actions">
        <button class="cx-next" type="button" disabled>下一部</button>
        <button class="cx-play secondary" type="button">播放</button>
      </div>
      <div style="margin-top:8px;color:#64727b;">快捷键：<kbd>N</kbd> 下一部，<kbd>P</kbd> 播放</div>
    `;
    document.body.appendChild(panel);

    const autoNext = panel.querySelector('.cx-auto-next');
    const autoPlay = panel.querySelector('.cx-auto-play');
    const mutedStart = panel.querySelector('.cx-muted-start');
    autoNext.checked = STATE.autoNext;
    autoPlay.checked = STATE.autoPlay;
    mutedStart.checked = STATE.mutedStart;
    autoNext.addEventListener('change', () => {
      STATE.autoNext = autoNext.checked;
      localStorage.setItem('codexJinshiAutoNext', STATE.autoNext ? '1' : '0');
      setStatus(STATE.autoNext ? '自动下一部已开启。' : '自动下一部已关闭。');
    });
    autoPlay.addEventListener('change', () => {
      STATE.autoPlay = autoPlay.checked;
      localStorage.setItem('codexJinshiAutoPlay', STATE.autoPlay ? '1' : '0');
      setStatus(STATE.autoPlay ? '自动播放已开启。' : '自动播放已关闭。');
    });
    mutedStart.addEventListener('change', () => {
      STATE.mutedStart = mutedStart.checked;
      localStorage.setItem('codexJinshiMutedStart', STATE.mutedStart ? '1' : '0');
      setStatus(STATE.mutedStart ? '静音启动已开启。' : '静音启动已关闭。');
    });
    panel.querySelector('.cx-close').addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? '' : 'none';
    });
    panel.querySelector('.cx-next').addEventListener('click', () => goNext('manual'));
    panel.querySelector('.cx-play').addEventListener('click', () => playCurrent('manual'));
    return panel;
  }

  function syncButtons(panel) {
    if (!panel) return;
    const btn = panel.querySelector('.cx-next');
    if (btn) btn.disabled = !STATE.nextLesson && !findNativeNextButton();
  }

  function renderPanel() {
    const panel = ensurePanel();
    const video = STATE.video || findVideo();
    const duration = video && Number.isFinite(video.duration) ? video.duration : 0;
    const current = video ? video.currentTime || 0 : 0;
    const percent = duration > 0 ? Math.max(0, Math.min(100, (current / duration) * 100)) : 0;
    const curName = STATE.currentLesson ? lessonName(STATE.currentLesson) : '识别中';
    const nextName = STATE.nextLesson ? lessonName(STATE.nextLesson) : '无';
    const countText = STATE.lessons.length
      ? `${STATE.currentIndex + 1 > 0 ? STATE.currentIndex + 1 : '?'} / ${STATE.lessons.length}` : '--';

    panel.querySelector('.cx-status').textContent = STATE.statusText;
    panel.querySelector('.cx-current').textContent = curName;
    panel.querySelector('.cx-next-name').textContent = nextName;
    panel.querySelector('.cx-play-state').textContent = playbackText(video);
    panel.querySelector('.cx-audio-state').textContent = video ? (video.muted ? '静音' : '有声') : '--';
    panel.querySelector('.cx-progress-text').textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    panel.querySelector('.cx-progress-fill').style.width = `${percent}%`;
    panel.querySelector('.cx-count').textContent = countText;
    panel.querySelector('.cx-countdown').textContent = STATE.countdownTimer ? `${STATE.countdownLeft}s` : '--';
    syncButtons(panel);
  }

  // ============ 课程列表页 ============
  async function getMyCourses() {
    const token = getCookie('eneteduToken');
    const tid = getCookie('tenantId') || '2';
    if (!token) return [];

    try {
      const resp = await fetch(API.courseList + '?page=1&pageSize=1000', {
        credentials: 'include',
        headers: {
          Accept: 'application/json, text/plain, */*',
          Authorization: token,
          'tenant-id': tid,
          'sign-key': API.courseListSign,
        },
      });
      const json = await resp.json();
      if (json.code !== 200) return [];

      const list = json.data?.records || [];
      return list.map((item) => ({
        id: String(item.course_id || item.id || ''),
        title: String(item.name || '').substring(0, 50),
        studyed: parseFloat(item.studyed) || 0,
        duration: parseFloat(item.duration) || 0,
        status: item.status,
        url: `/site/personalCenter/courseLearning/study?courseId=${item.course_id || item.id}&cardNumber=null`,
      }));
    } catch (e) {
      log('课程列表 API 失败: ' + e.message);
      return [];
    }
  }

  function renderCourseListPanel() {
    const panel = ensurePanel();
    const courses = STATE.myCourses;
    const idx = parseInt(localStorage.getItem(CROSS.idxKey) || '0');

    // 隐藏学习页专用控件
    panel.querySelectorAll('.cx-row').forEach((r) => { r.style.display = 'none'; });
    const actions = panel.querySelector('.cx-actions');
    const kbd = panel.querySelector('.cx-actions + div');
    if (actions) actions.style.display = 'none';
    if (kbd) kbd.style.display = 'none';
    const titleEl = panel.querySelector('.cx-title span');
    if (titleEl) titleEl.textContent = courses.length ? '课程列表导航' : '学习辅助';

    let html = '<div style="font-size:12px;color:#46545d;margin-bottom:4px">';
    html += courses.length > 0
      ? `共 ${courses.length} 门课程 | 已完成 ${STATE.courseDoneCount} 门`
      : '正在获取课程列表...';
    html += '</div>';

    if (courses.length > 0) {
      html += '<div style="max-height:240px;overflow-y:auto;margin-bottom:6px">';
      courses.forEach((c, i) => {
        const done = c.studyed >= c.duration && c.duration > 0;
        const icon = done ? '✓' : i === idx ? '▶' : '○';
        const color = done ? '#176b5b' : i === idx ? '#c98b2e' : '#6a767e';
        const pct = c.duration > 0 ? Math.round(c.studyed / c.duration * 100) : 0;
        html += `<div style="display:flex;align-items:center;padding:3px 0;font-size:11px;gap:6px">
          <span style="color:${color};width:14px;text-align:center;flex-shrink:0">${icon}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#172026">${escHtml(c.title)}</span>
          <span style="color:${done ? '#176b5b' : '#6a767e'};min-width:32px;text-align:right;flex-shrink:0">${pct}%</span>
        </div>`;
      });
      html += '</div>';
    }

    html += `<div style="font-size:11px;color:#6a767e">当前: 第${idx + 1}门 / 共${courses.length || '?'}门</div>`;

    panel.querySelector('.cx-status').textContent = STATE.statusText;
    const grid = panel.querySelector('.cx-grid');
    if (grid) grid.innerHTML = html;
  }

  function courseListLoop() {
    const doneSignal = localStorage.getItem(CROSS.doneKey);
    if (doneSignal) {
      localStorage.removeItem(CROSS.doneKey);
      const idx = parseInt(localStorage.getItem(CROSS.idxKey) || '0');
      localStorage.setItem(CROSS.idxKey, String(idx + 1));
      STATE.courseDoneCount = parseInt(localStorage.getItem('codexJinshiDoneCount') || '0');
      setStatus(`课程 #${idx + 1} 已完成，查找下一门...`);
      setTimeout(() => location.reload(), 1500);
      return;
    }

    if (STATE.courseListClicked || STATE._courseListLoading) return;

    STATE._courseListLoading = true;
    getMyCourses().then((courses) => {
      STATE._courseListLoading = false;
      STATE.myCourses = courses;
      const idx = parseInt(localStorage.getItem(CROSS.idxKey) || '0');
      renderCourseListPanel();

      if (courses.length === 0) {
        setStatus('未找到课程，等待重试...');
        return;
      }

      if (idx >= courses.length) {
        localStorage.setItem(CROSS.idxKey, '0');
        localStorage.setItem('codexJinshiDoneCount', '0');
        STATE.courseDoneCount = 0;
        STATE.courseListClicked = false;
        setStatus('所有课程已完成！计数器已重置。');
        renderCourseListPanel();
        return;
      }

      STATE.courseListClicked = true;
      const course = courses[idx];
      setStatus(`进入课程 [${idx + 1}/${courses.length}]: ${course.title}`);

      const safetyTimer = setTimeout(() => {
        if (STATE.courseListClicked) {
          STATE.courseListClicked = false;
          setStatus('导航超时，重试中...');
        }
      }, 30000);

      setTimeout(() => {
        clearTimeout(safetyTimer);
        location.assign(course.url);
      }, 2000);
    }).catch(() => {
      STATE._courseListLoading = false;
      setStatus('获取课程列表失败，稍后重试。');
    });
  }

  function signalCourseComplete() {
    STATE.courseDoneCount++;
    localStorage.setItem('codexJinshiDoneCount', String(STATE.courseDoneCount));
    localStorage.setItem(CROSS.doneKey, '1');
    setStatus('本课程全部完成，返回课程列表...');
    setTimeout(() => {
      location.assign(PAGE.myCourse);
    }, 3000);
  }

  // ============ 登录检测 & 自动跳转 ============
  function checkLoginAndRedirect() {
    const loggedIn = isLoggedIn();
    log('登录状态: ' + (loggedIn ? '已登录' : '未登录'));

    if (loggedIn) {
      // 已登录：如果不在课程相关页面，自动跳到 MyCourse
      if (!STATE.isLearningPage && !STATE.isMyCoursePage) {
        log('已登录，自动跳转到课程列表');
        setStatus('已登录，正在进入课程列表...');
        setTimeout(() => {
          location.assign(PAGE.myCourse);
        }, 1500);
        return true;
      }
    } else {
      // 未登录且不在登录页：跳转到登录页
      if (!STATE.isLoginPage) {
        log('未登录，跳转到登录页');
        setStatus('未登录，正在跳转到登录页...');
        setTimeout(() => {
          location.assign(PAGE.login);
        }, 1500);
        return true;
      }
      // 已在登录页：等待用户登录
      setStatus('请登录金师培训平台...');
    }
    return false;
  }

  // ============ 学习页逻辑 ============
  function findVideo() {
    const videos = Array.from(document.querySelectorAll('#J_prismPlayer video, video')).filter(visible);
    return videos.sort((a, b) => {
      const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
      const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
      return areaB - areaA;
    })[0] || null;
  }

  function findNativeNextButton() {
    const playerNext = document.querySelector('#J_prismPlayer .next-button, .Aliplayer-video .next-button');
    if (visible(playerNext)) return playerNext;
    return Array.from(document.querySelectorAll('button'))
      .filter((el) => !el.closest(`#${STATE.panelId}`))
      .find((el) => visible(el) && /下一部|下一节|下一个/.test(el.textContent || '')) || null;
  }

  function findPlayButton() {
    const selectors = [
      '#J_prismPlayer .prism-big-play-btn',
      '#J_prismPlayer .prism-play-btn',
      '.Aliplayer-video .prism-big-play-btn',
      '.Aliplayer-video .prism-play-btn',
      '#J_prismPlayer [class*="play"]',
    ];
    for (const sel of selectors) {
      const btn = Array.from(document.querySelectorAll(sel))
        .find((el) => visible(el) && !/pause/i.test(el.className || ''));
      if (btn) return btn;
    }
    return null;
  }

  function flattenLessons(list, output = []) {
    (list || []).forEach((item) => {
      if (item && (item.videoId || item.id)) output.push(item);
      if (Array.isArray(item.children)) flattenLessons(item.children, output);
    });
    return output;
  }

  function lessonName(lesson) {
    return lesson.mediaName || lesson.chapterName || lesson.fileName || lesson.name || lesson.id || '未命名课时';
  }

  async function loadLessons() {
    const courseId = getParams().get('courseId');
    if (!courseId) return;
    STATE.courseId = courseId;

    const token = getCookie('eneteduToken');
    const tid = getCookie('tenantId') || '2';
    if (!token) return;

    // 防并发
    if (STATE._loadingLessons) return;
    STATE._loadingLessons = true;

    try {
      // 如果已知有效的课时 API 路径，直接使用
      if (STATE.lessonApiPath) {
        try {
          const signKey = STATE.lessonApiPath.replace(/\//g, '') + 'get';
          const resp = await fetch(`${STATE.lessonApiPath}?courseId=${encodeURIComponent(courseId)}&type=1`, {
            credentials: 'include',
            headers: {
              Accept: 'application/json, text/plain, */*',
              Authorization: token,
              'tenant-id': tid,
              'sign-key': signKey,
            },
          });
          const json = await resp.json();
          const list = json.data?.records || json.data || [];
          STATE.lessons = flattenLessons(list);
          if (STATE.lessons.length > 0) {
            updateCurrentLesson();
            STATE._loadingLessons = false;
            return;
          }
        } catch (e) { /* 回退到探测 */ }
        STATE.lessonApiPath = '';
      }

      // 探测可用的课时 API
      for (const ep of API.lessonEndpoints) {
        try {
          const signKey = ep.replace(/\//g, '') + 'get';
          const resp = await fetch(`${ep}?courseId=${encodeURIComponent(courseId)}&type=1`, {
            credentials: 'include',
            headers: {
              Accept: 'application/json, text/plain, */*',
              Authorization: token,
              'tenant-id': tid,
              'sign-key': signKey,
            },
          });
          const json = await resp.json();
          const list = json.data?.records || json.data || [];
          STATE.lessons = flattenLessons(list);
          if (STATE.lessons.length > 0) {
            STATE.lessonApiPath = ep;
            log('课时 API: ' + ep + ' (' + STATE.lessons.length + ' 课时)');
            updateCurrentLesson();
            STATE._loadingLessons = false;
            return;
          }
        } catch (e) { /* 尝试下一个 */ }
      }

      setStatus('课时列表 API 全部失败，稍后重试。');
    } finally {
      STATE._loadingLessons = false;
    }
  }

  function updateCurrentLesson() {
    const params = getParams();
    STATE.currentId = params.get('selectId') || '';
    if (!STATE.currentId && STATE.lessons[0]) STATE.currentId = String(STATE.lessons[0].id);

    const index = STATE.lessons.findIndex((l) => String(l.id) === String(STATE.currentId));
    STATE.currentIndex = index;
    STATE.currentLesson = index >= 0 ? STATE.lessons[index] : null;
    STATE.nextLesson = index >= 0 ? STATE.lessons[index + 1] || null : null;

    const curName = index >= 0 ? lessonName(STATE.lessons[index]) : '当前课时';
    if (STATE.nextLesson) {
      setStatus(`${curName}。下一部：${lessonName(STATE.nextLesson)}`);
    } else if (STATE.lessons.length) {
      setStatus(`${curName}。已经是最后一部。`);
    }
  }

  function buildNextUrl() {
    if (!STATE.nextLesson) return '';
    const params = getParams();
    params.set('selectId', STATE.nextLesson.id);
    if (!params.has('cardNumber')) params.set('cardNumber', 'null');
    return `${location.pathname}?${params.toString()}`;
  }

  async function goNext(source) {
    if (STATE.changingLesson) return;
    STATE.changingLesson = true;
    clearCountdown();
    updateCurrentLesson();

    const nextUrl = buildNextUrl();
    if (nextUrl) {
      setStatus(`正在进入下一部：${lessonName(STATE.nextLesson)}`);
      location.assign(nextUrl);
      return;
    }

    const nativeButton = findNativeNextButton();
    if (nativeButton) {
      nativeButton.click();
      setStatus('已点击播放器下一部按钮。');
      await afterLessonChange();
      STATE.changingLesson = false;
      return;
    }

    if (STATE.lessons.length > 0 && STATE.currentIndex >= STATE.lessons.length - 1) {
      signalCourseComplete();
      return;
    }

    setStatus(source === 'auto' ? '本节已结束，但没有识别到下一部。' : '没有识别到下一部。');
    STATE.changingLesson = false;
  }

  async function afterLessonChange() {
    const oldSrc = STATE.lastSrc;
    const started = Date.now();
    while (Date.now() - started < 10000) {
      await new Promise((r) => setTimeout(r, 500));
      updateCurrentLesson();
      const video = findVideo();
      const src = video && (video.currentSrc || video.src);
      if (src && src !== oldSrc) {
        STATE.lastSrc = src;
        STATE.lastEndedSrc = '';
        bindVideo(video);
        if (STATE.autoPlay) await playCurrent('auto');
        return;
      }
    }
    if (STATE.autoPlay) await playCurrent('auto');
  }

  async function tryRestoreSound(video) {
    if (!video) return true;
    const restore = async () => {
      if (!video.isConnected) return;
      video.volume = 1;
      video.muted = false;
      video.removeAttribute('muted');
      await wait(500);
      if (video.paused && STATE.mutedStart) {
        video.muted = true;
        await video.play().catch(() => {});
        setStatus('浏览器禁止有声自动播放，已保持静音。');
        return false;
      }
      return true;
    };
    const restored = await restore();
    if (restored) {
      [1500, 3000, 5000].forEach((d) => setTimeout(() => {
        video.volume = 1;
        video.muted = false;
        video.removeAttribute('muted');
      }, d));
    }
    return restored;
  }

  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function playCurrent(source) {
    const video = findVideo();
    if (!video) { setStatus('还没有找到视频。'); return false; }
    if (!video.paused && !video.ended) { setStatus('视频已经在播放。'); return true; }

    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    try {
      await video.play();
      if (video.muted) await tryRestoreSound(video);
      setStatus('已尝试播放当前视频。');
      return true;
    } catch (error) {
      const playBtn = findPlayButton();
      if (playBtn) {
        playBtn.click();
        await wait(800);
        if (!video.paused) { setStatus('已点击播放器按钮开始播放。'); return true; }
      }

      if (STATE.mutedStart) {
        try {
          video.muted = true;
          video.volume = 1;
          await video.play();
          await tryRestoreSound(video);
          setStatus(video.paused ? '浏览器拦截了自动播放，请手动点一次播放。' : '已用静音启动兜底开始播放。');
          return !video.paused;
        } catch (mutedError) { video.muted = false; }
      }

      setStatus(source === 'manual'
        ? '浏览器仍拦截播放，请点播放器中央的播放按钮一次。'
        : '浏览器拦截了自动播放，请手动点一次播放。');
      return false;
    }
  }

  function startCountdown() {
    clearCountdown();
    if (!STATE.autoNext) {
      setStatus('本节视频已结束。点击"下一部"或按 N 继续。');
      return;
    }
    if (document.visibilityState !== 'visible') {
      setStatus('页面不在前台，已暂停自动下一部。切回页面后按 N 继续。');
      return;
    }
    STATE.countdownLeft = 5;
    setStatus(`本节已结束，${STATE.countdownLeft} 秒后进入下一部。`);
    STATE.countdownTimer = setInterval(() => {
      STATE.countdownLeft -= 1;
      if (STATE.countdownLeft <= 0) {
        clearCountdown();
        goNext('auto');
      } else {
        setStatus(`本节已结束，${STATE.countdownLeft} 秒后进入下一部。`);
      }
    }, 1000);
  }

  function clearCountdown() {
    if (STATE.countdownTimer) clearInterval(STATE.countdownTimer);
    STATE.countdownTimer = null;
  }

  function bindVideo(video) {
    if (!video || video.dataset.cxBound === '1') return;
    video.dataset.cxBound = '1';
    STATE.video = video;
    STATE.lastSrc = video.currentSrc || video.src || STATE.lastSrc;

    video.addEventListener('play', () => {
      clearCountdown();
      STATE.lastEndedSrc = '';
      updateCurrentLesson();
      setStatus(STATE.nextLesson ? `正在播放。下一部：${lessonName(STATE.nextLesson)}` : '正在播放。');
    });
    video.addEventListener('ended', () => {
      updateCurrentLesson();
      startCountdown();
    });
  }

  // ============ 浏览器可见性变化处理 ============
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!STATE.isLearningPage) return;

    log('页面恢复可见');

    // 如果视频已结束但倒计时没启动（之前因 hidden 被跳过），重新触发
    const video = STATE.video || findVideo();
    if (video && video.ended && !STATE.countdownTimer) {
      updateCurrentLesson();
      startCountdown();
      return;
    }

    // 如果视频暂停中（可能是切后台时被浏览器暂停），尝试恢复播放
    if (video && video.paused && !video.ended && STATE.autoPlay) {
      playCurrent('auto');
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (event.target && /input|textarea|select/i.test(event.target.tagName)) return;
    if (!STATE.isLearningPage) return;
    const key = event.key.toLowerCase();
    if (key === 'n') { event.preventDefault(); goNext('manual'); }
    if (key === 'p') { event.preventDefault(); playCurrent('manual'); }
  });

  // ============ 登录页轮询 ============
  function loginPollLoop() {
    if (isLoggedIn()) {
      log('检测到登录成功，跳转到课程列表');
      setStatus('登录成功！正在进入课程列表...');
      setTimeout(() => location.assign(PAGE.myCourse), 1500);
    } else {
      setStatus('等待登录...');
    }
  }

  // ============ 学习页主循环 ============
  function hookHistory() {
    ['pushState', 'replaceState'].forEach((name) => {
      const original = history[name];
      history[name] = function patchedHistory() {
        const result = original.apply(this, arguments);
        window.dispatchEvent(new Event('cx-urlchange'));
        return result;
      };
    });
    window.addEventListener('popstate', () => window.dispatchEvent(new Event('cx-urlchange')));
    window.addEventListener('cx-urlchange', () => setTimeout(scan, 500));
  }

  function findStartLearningButton() {
    // 优先找 button 元素，文本精确匹配"开始学习"
    const btn = Array.from(document.querySelectorAll('button')).find((el) => {
      if (!visible(el)) return false;
      const t = (el.textContent || '').trim();
      return t === '开始学习' || t === '进入学习' || t === '开始';
    });
    if (btn) return btn;
    // 回退到其他可点击元素
    return Array.from(document.querySelectorAll('a, span, div')).find((el) => {
      if (!visible(el)) return false;
      const t = (el.textContent || '').trim();
      return t === '开始学习' || t === '进入学习';
    }) || null;
  }

  async function scan() {
    ensurePanel();

    // 自动点击"开始学习"按钮（仅一次）
    if (!STATE._startClicked) {
      const startBtn = findStartLearningButton();
      if (startBtn) {
        STATE._startClicked = true;
        log('点击"开始学习"按钮');
        startBtn.click();
        await wait(2000);
      }
    }

    const courseId = getParams().get('courseId') || '';
    if (courseId && courseId !== STATE.courseId) {
      STATE.courseId = courseId;
      STATE.lessons = [];
      STATE.currentLesson = null;
      STATE.currentIndex = -1;
      STATE.nextLesson = null;
      STATE._startClicked = false;
    }
    if (!STATE.lessons.length) await loadLessons();
    updateCurrentLesson();

    const video = findVideo();
    if (video) {
      bindVideo(video);
      const src = video.currentSrc || video.src;
      if (src && src !== STATE.lastSrc) {
        STATE.lastSrc = src;
        STATE.lastEndedSrc = '';
        if (STATE.autoPlay && video.paused && !video.ended) await playCurrent('auto');
      } else if (STATE.autoPlay && video.paused && !video.ended && document.visibilityState === 'visible') {
        await playCurrent('auto');
      }

      // 检查视频是否接近结束（容差 0.8 秒）
      const nearEnd = Number.isFinite(video.duration) && video.duration > 0
        && video.currentTime > 0 && video.duration - video.currentTime < 0.8;
      if ((video.ended || nearEnd) && src && STATE.lastEndedSrc !== src) {
        STATE.lastEndedSrc = src;
        updateCurrentLesson();
        startCountdown();
      }
    }
  }

  const observer = new MutationObserver(() => {
    clearTimeout(observer.timer);
    observer.timer = setTimeout(scan, 600);
  });

  // ============ 启动 ============
  function boot() {
    ensurePanel();
    log('v0.7.0 启动 | ' + location.pathname);

    // 1. 登录检测 & 自动跳转
    if (checkLoginAndRedirect()) return;

    // 2. 登录页：轮询等待登录
    if (STATE.isLoginPage) {
      loginPollLoop();
      setInterval(loginPollLoop, 3000);
      return;
    }

    // 3. 课程列表页：跨课程导航
    if (STATE.isMyCoursePage) {
      setStatus('课程列表模式 — 自动遍历所有课程');
      renderCourseListPanel();
      courseListLoop();
      setInterval(courseListLoop, 8000);
      setInterval(renderCourseListPanel, 2000);
      return;
    }

    // 4. 课程学习页
    if (STATE.isLearningPage) {
      hookHistory();
      scan();
      setInterval(scan, 5000);
      setInterval(renderPanel, 1000);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      return;
    }

    // 5. 其他页面（如个人中心首页）：检测登录后跳转
    loginPollLoop();
    setInterval(loginPollLoop, 5000);
  }

  if (document.body) {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  }
})();
