# 北医下班宇宙

一个送给每天和小鼠打交道的北医博士的非官方解压小玩具。

**[进入下班宇宙，开始解压 →](https://chymlltrn.github.io/beiyi-after-hours/)**

## 玩法

- **实验室大拆迁**：点击实验室炸出碎片，累计十次，或者直接一键毁灭。
- **导师语录粉碎机**：把虚构导师的「再补一组」送进黑洞。
- **地球重启计划**：击碎星球，甩掉 DDL 和 Reviewer 2。
- **小鼠罢工派对**：鼠鼠们带薪放假，你也可以摸鱼。
- **情绪碎纸机**：写下吐槽，把它粉碎。内容仅在当前页面内存中处理，清空后不留历史，没有后端与数据上传。
- **摸鱼急救**：一分钟轻轻吸气与慢慢呼气，可以随时结束；切换到其他页面时暂停计时。

所有角色和场景均为虚构，与北京大学或北京大学医学部无官方关联。鼠鼠们全员平安下班。

## 本地运行

需要 Node.js 18 或以上，无需安装依赖。

```sh
npm run dev
```

打开 `http://127.0.0.1:8087`。`PORT=8090 npm run dev` 可以更换端口。

```sh
npm run check
npm run build
```

`dist/` 是完整静态站点，可部署到 GitHub Pages 或任何静态托管服务。资源均使用相对路径，支持 GitHub 项目子目录。

## 交互与可访问性

桌面和手机均可使用；互动画布支持点击、触摸、空格和回车。默认静音，开启后音效由 Web Audio 合成。自动遵循系统「减少动态效果」设置，后台标签页暂停 Canvas 动画。弹窗支持 Escape 关闭和重复体验。

原创 Canvas 插画、原生 JavaScript 和 CSS，无外部字体、图片、追踪器或第三方运行依赖。

## 浏览器验证

`qa/browser-check.cjs` 使用外部提供的 Playwright 检查完整玩法、手机触摸、七种视口宽度、音效、碎纸机输入与呼吸计时。运行环境提供 Playwright 与浏览器后可执行：

```sh
node qa/browser-check.cjs
```

可选环境变量：`PLAYWRIGHT_PATH` 指定 Playwright 模块，`CHROME_PATH` 指定浏览器，`SITE_URL` 指定测试网址，`BROWSER_PROXY` 指定浏览器代理。`qa/verification.json` 和 `qa/visual-verdict.json` 保留检查结果。
