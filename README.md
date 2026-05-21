# 金师培训平台学习辅助

[![Version](https://img.shields.io/badge/version-0.7.0-brightgreen)](https://github.com/chu0119/jinshi-auto-learning)
[![Install](https://img.shields.io/badge/点击安装-最新版-orange)](https://raw.githubusercontent.com/chu0119/jinshi-auto-learning/master/jinshi-assistant.user.js)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> 点击上方 **点击安装** 按钮，Tampermonkey 会自动弹出安装对话框。
> 脚本内置 `@updateURL`，后续版本更新时油猴会自动检测并提示升级。

自动完成 [金师培训平台](https://jinshi.enetedu.com) 全部课程学习的油猴脚本。登录后自动遍历所有课程，逐课时播放，视频结束后自动连播下一部。切后台不中断，页面恢复可见后自动继续。

## 功能

- **登录检测** — 进入网站自动检测登录状态，未登录跳登录页，已登录跳课程列表
- **全课程遍历** — 自动逐个进入课程，一门学完自动切下一门
- **课时连播** — 当前视频结束后 5 秒倒计时自动进入下一课时
- **自动播放** — 进入课时自动点击"开始学习"并播放视频，浏览器拦截时静音兜底
- **后台不中断** — 切到其他标签页或最小化后，切回来自动恢复播放或继续倒计时
- **浮动面板** — 实时显示课程名、课时进度、播放状态、倒计时
- **快捷键** — `N` 下一部，`P` 播放

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击上方 **点击安装** 按钮，Tampermonkey 自动弹窗安装
3. 或手动：打开 [jinshi-assistant.user.js](jinshi-assistant.user.js)，复制内容到 Tampermonkey 新建脚本
4. 打开 [金师培训平台](https://jinshi.enetedu.com)，脚本自动运行

> **自动更新**：脚本已配置 `@updateURL`，发布新版本后油猴会自动检测并提示升级。

## 使用方式

安装后打开任意 `jinshi.enetedu.com` 页面，脚本自动运行：

```
进入网站 → 检测登录
  ├─ 未登录 → 跳转登录页 → 等待登录 → 登录成功
  └─ 已登录 → 跳转课程列表 → 自动进入第1门课

课程学习页 → 点击"开始学习" → 课时1 → 课时2 → ... → 课时N
  └─ 全部完成 → 返回课程列表 → 下一门课 → ...

全部课程完成 → 重置计数器 → 从头开始
```

### 面板说明

| 项目 | 说明 |
|------|------|
| 当前 | 正在播放的课时名称 |
| 下一部 | 即将播放的课时 |
| 状态 | 播放中 / 暂停中 / 已结束 |
| 声音 | 有声 / 静音 |
| 进度 | 当前播放时间 |
| 课时 | 当前第几个 / 总课时数 |
| 倒计时 | 视频结束后自动切下一部的倒计时 |

### 复选框

- **视频结束后自动下一部** — 关闭后需要手动按 N 或点击按钮
- **进入课时后尝试播放** — 关闭后不自动播放
- **被拦截时静音启动** — 浏览器禁止有声自动播放时用静音兜底

## 更新日志

### v0.7.0
- 新增浏览器切后台/切标签页后自动恢复播放
- 修复"开始学习"按钮误匹配"学习状态：未开始"标签
- 修复课时 API 并发加载和响应解析
- 修复课程列表 API 路径和 sign-key 请求头
- 优化连播链路健壮性

### v0.4.0
- 初版，支持单课程内课时自动切换

## 技术细节

- 适配金师培训平台 Nuxt.js SPA 架构
- 通过 API 获取课程列表和课时树（自动探测可用端点）
- 使用 `localStorage` 协调跨页面状态
- 基于真实 DOM 结构定位视频播放器（PrismPlayer / Aliplayer）
- `visibilitychange` 事件监听处理后台恢复

## 开发

```bash
git clone https://github.com/chu0119/jinshi-auto-learning.git
# 直接编辑 .user.js 文件，在 Tampermonkey 中加载本地文件即可测试
```

## License

MIT
