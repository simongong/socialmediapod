# Drama Reader (Social Media Pod) 🎧

**Drama Reader** 是一款基于大模型本地化能力与浏览器生态构建的沉浸式社交媒体听读工具（Chrome Extension + Python FastAPI）。它可以将长篇的 Twitter (X) 和 Reddit 讨论贴瞬间转化为带有角色扮演的“广播剧”。

---

## 0. 为什么做这个工具？面向的用户和使用场景

我们每天都会在社交媒体上刷到大量英文讨论（例如 Reddit、Twitter）。但阅读这些长贴往往需要长时间盯着屏幕，容易引发视觉疲劳。

同时作为ESL，如果想提升口语能力，需要更多的听力输入而不是视觉输入。所以把日常刷社交论坛内容变成听力输入，娱乐的同时又能提升口语水平，一举两得。

**核心痛点：**
* **语言环境：** 想通过阅读原本社交媒体讨论来构建英文语境，但缺乏有效且有趣的输入手段。
* **生硬的 TTS：** 市面上的网页朗读工具往往使用单一、死板的机器合成音，对于多用户的社交长贴，听起来就像是一个人在机械地念经，毫无交流感可言。

**面向用户与场景：**
这款工具非常适合**英语学习者、信息重度消费者以及播客爱好者**。
只需在网页上点击“Play”，它就会自动抓取整个帖子的上下文，为每一个不同的用户分配一个固定且独特的发音人（Male/Female/不同口音），将枯燥的文字变成一场生动的、多角色的英文播客（Podcast/Drama Series）。

**目前支持的英文内容平台：Reddit, Twitter(X.com)**

---

## 1. 快速部署使用

本项目分为两个独立的部分：负责抓取和控制的浏览器插件（Extension），以及负责本地高性能语音合成的后端服务（Backend）。

### 1.1 部署本地 AI 语音后端 (Mac M1/M2/M3)
后端使用 Python 构建，底层依赖苹果芯片的 MPS 硬件加速。
1. **进入后端目录并创建虚拟环境：**
   ```bash
   cd socialmediapod/backend
   python3 -m venv venv
   source venv/bin/activate
   ```
2. **安装核心依赖项：**
   ```bash
   pip install -r requirements.txt
   ```
3. **预下载 Kokoro TTS 模型与音源库：**
   为了避免首次合成时出现漫长的下载等待，请运行预下载脚本：
   ```bash
   python download_model.py
   ```
4. **启动 FastAPI 服务：**
   ```bash
   uvicorn main:app --host 127.0.0.1 --port 8000
   ```
   *服务启动后将在本地 `http://localhost:8000` 监听插件的合成请求。*

### 1.2 安装 Chrome 浏览器插件
1. 打开 Google Chrome，在地址栏输入 `chrome://extensions/`。
2. 在页面右上角开启 **开发者模式 (Developer mode)**。
3. 点击左上角的 **加载已解压的扩展程序 (Load unpacked)**。
4. 选择本项目中的 `socialmediapod/extension` 文件夹。

### 1.3 开始听剧！
* 保持你的 Python 后端服务在终端中运行。
* 浏览器访问任意英文的 Reddit 帖子或 Twitter Thread。
* 页面右下角会出现一个浮窗播放器。
* 它包含了：**灯状态栏**、**跳播控制（Prev/Next）**，以及一个**可展开的当前播报列表（Playlist）**。
* 点击 **▶ Play** 开始沉浸式体验！当前播放项会在页面和 Playlist 列表中同步高亮，并且会自动跟随你的视线丝滑滚动。


---

## 2. 技术选型与 Design Decision

本项目秉承 **Pragmatic (务实)、直接、无打扰** 的核心理念。

### 2.1 浏览器端：Vanilla JS + Manifest V3
* **为什么不用 React/Vue 构建插件？**
  社交媒体页面的 DOM 结构非常复杂（存在大量的 Shadow DOM 甚至动态渲染的 `[data-testid]`）。我们需要的是一个极轻量的**侵入式脚本**用于抽取干净的文本和控制 Audio 上下文。引入前端框架不仅会增加体积，还会受到宿主页面 CSS/JS 的相互污染。

### 2.2 服务端：FastAPI + Kokoro-82M (Apple MPS)
* **为什么不用浏览器原生的 Web Speech API？**
  我们经历过 **Phase 1**（依赖 macOS 系统内置语音），虽然实现了 0 延迟，但系统合成音（即使是 Novelty Voices）依然缺乏真实的情感起伏，且发音人数量非常受限。
* **为什么选择 Kokoro-82M？**
  Kokoro 是目前在**轻量级本地化**与**拟真度**之间平衡得最好的模型。整个模型权重不到 100MB，可以秒级加载。与庞大的 VITS 或 XTTS 不同，它极度轻快，配合 Apple Silicon 的 PyTorch MPS（Metal Performance Shaders）加速，几乎能做到“点击即播”的低延迟流式反馈。
* **基于 NLP 性别预测的配音分配（Intelligent Voice Mapping）：**
  我们并没有建立复杂的数据库去记忆“哪个用户用了哪个声音”。为了不出现“女作者发出低沉男低音”的错位感，后端接入了完全离线的 `gender-guesser` NLP 字典模型。
  通过解析作者的 Display Name（提取例如 *Steven*, *Alice*），将其送入预测流分类。接着在 MALE 和 FEMALE 两个精选的年轻活力配音池中，通过 `md5(AuthorName) % len(VOICES)` 计算哈希分配专属声音。这保证了**无状态、零存储成本、性别吻合**的神奇效果。

### 2.3 DOM 懒加载探测与原生去广告
* **突破 React 无限滚动限制（Infinite Scroll）：**
  针对 Twitter/Reddit 滚动到底部才加载新节点的“虚拟列表”特性，我们在 `playSequence` 的引擎里设计了**动态探针与指纹记录策略**。当播放到列表末尾时，它不会停止，而是基于当前的网页状态再执行一次 DOM `querySelectorAll`。通过比对 `processedTexts` （作者+文本）构成的全局哈希 Set 记忆库，只把最新鲜出炉的底楼评论装填进弹夹。配合 `scrollIntoView` 的自动滚页，实现了真正的“无限播放永动机”。
  Twitter 经常在回帖中穿插与正常推文一模一样的伪装广告（Sponsored Ad）。而且用户的浏览器插件（如 ABP）会在视觉上把它 `display: none`。这导致 `innerText` 查不出广告标记，会误将其作为普通评论发给 TTS 阅读。我们果断使用了 `textContent` 来穿透 CSS 强行嗅探底层的 `span`，只要碰见包含“Ad”的隐形元素，就将其判定为广告静默抛弃。

---

## 3. Future Milestones

虽然本项目目前已经具备沉浸式的听读体验，但在下一次的版本迭代（Milestone v1.5 / v2.0）中，我们可以考虑加入以下特性：

1. **多语种混合播报 (Multi-Language Support)**
   目前为了防止模型崩溃，我们强行利用正则滤掉了纯中文评论。未来可以引入更轻量的多语言检测。如果 Kokoro 更新了全语种支持（或我们混入另一个专门读中文的小模型），就可以实现同一页面内“英文用英语声优，中文用国配声优”的无缝切换。
   
2. **倍速播放与音量调节 (Playback Speed & Volume)**
   在 UI 面板上加入 `1.0x / 1.5x / 2.0x` 的快捷按键或滑块。插件端接收到指令后，可以直接将其传递给 FastAPI 后端的 `speed` 参数，实现全局的丝滑变速。

3. **支持键盘快捷键 (Keyboard Shortcuts)**
   支持通过 `Space` 键全局控制播放/暂停，通过 `←` 和 `→` 键快速飞梭（Skip To Prev/Next Track），让用户在浏览网页时完全解放鼠标。

4. **播客离线导出 (Podcast MP3 Export)**
   当提取完整个长篇 Thread 后，允许用户点击一个 "Export to MP3" 按钮。后端能将所有生成的碎片 `.wav` 文件拼接成一个完整的播客音频文件（可能还会自动混入极短的留白作为转场），供用户下载到手机本地离线听。

5. **嵌套引用与多媒体解析 (Quote & Context Awareness)**
   目前的抓取逻辑仅限于主贴和文字。未来可以深度解析 Twitter 里的“引用推文（Quoted Tweets）”，在播放时加入类似 *"Jane Doe quoted: ... "* 的前置提示语。对于包含长图或文本图片的推文，或许还能结合轻量级 OCR（如 Tesseract.js）提取核心文字播报。
