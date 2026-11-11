# 方吧唧 · Badge Studio

方形吧唧（圆角 / 直角）和亚克力方牌的商品样机生成器。上传插画，就能生成带柔雾高光和柔和阴影的效果图，导出透明 PNG 或白底陈列拼图。

**在线使用：** https://shuisutang.github.io/badge-studio/

![preview](docs/preview.png)

## 怎么用

1. 点击、拖入或粘贴（Ctrl+V）图片，可以一次导入多张。
2. 在「02 款式与构图」里给每张图单独选款式、旋转、尺寸、裁切和外圈叠色。觉得某张调得好，可以点「应用到全部图片」。
3. 「03 外观与材质」和「04 版权标」是所有图片共用的设置。
4. 导出：单张透明 PNG（1200 / 2000 / 3000 px）、白底展示拼图，或「全部打包 zip」。

作品会自动保存在当前浏览器里，刷新页面不会丢；点「清空」会连本机存档一起删除。

## 隐私

全部在浏览器本地处理。图片不会上传到任何服务器，页面也没有统计或追踪代码。

## 本地开发

需要 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run dev          # 本地开发 http://localhost:5173
npm test             # 单元测试（Vitest）
npm run build        # 类型检查 + 构建到 dist/
npm run test:e2e     # 端到端测试（Playwright，会先启动 vite preview）
```

本机已经装了 Chrome 的话，可以用 `CHROME_PATH=/usr/bin/google-chrome npm run test:e2e`；没有的话先运行 `npx playwright install chromium`。

推送到 main 后，GitHub Actions 会自动构建并部署到 GitHub Pages。

## 目录

```
src/model     数据模型、默认值、状态 store
src/image     图片解码与缩放（createImageBitmap，超大图只保留缩略代理）
src/color     自动取主色、叠色
src/render    吧唧 / 亚克力渲染器（预览、缩略图、导出共用同一个入口）
src/export    单张 PNG、展示拼图、zip
src/persist   IndexedDB 自动保存
src/ui        面板、陈列、拖放等界面
tests/unit    纯逻辑单元测试
tests/e2e     回归、修复项、移动端，以及与 v16 的像素对比
```

非官方同人工具，只用于制作你有权使用的图片。

Made by 幽酱 (@Shuisutang)
