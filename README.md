# CubeTutor 智能魔方教学系统

> 《大模型应用与开发》期末综合实战项目 —— **选题 09：基于 MCP 协议与大模型的智能魔方教学与交互玩具**

CubeTutor 是一个「大模型 + MCP 协议 + 计算机视觉 + 3D 交互」的智能魔方教学平台。系统以浏览器中的 3D 拟真魔方为交互载体，通过 **MCP（Model Context Protocol）工具接口**让大模型实时感知魔方 54 格状态，自动调用层先法 / CFOP / Kociemba 三种求解引擎生成分步还原路径，并以拟人化对话、分步语音讲解与 3D 动画同步演示的方式，手把手教用户复原魔方；同时支持**摄像头拍摄实体魔方**，由 YOLOv8 视觉模型自动检测并录入六面颜色，实现「实体魔方 → 数字孪生 → AI 教学」的完整闭环。

- 前端地址（本地启动后）：<http://localhost:5173/>
- 后端接口（FastAPI + Swagger）：<http://127.0.0.1:8000/docs>

---

## 一、核心功能（Demo 实现）

| # | 功能 | 说明 |
|---|------|------|
| 1 | **MCP 工具链驱动的 Agent 求解教学** | Agent 通过真实 MCP JSON-RPC 协议依次调用 `get_cube_state → validate_state → get_solution → apply_move` 四个工具，感知魔方状态、校验合法性、计算解法并逐步推演，全过程工具调用记录会实时展示在前端对话面板中 |
| 2 | **三种求解引擎** | 新手层先法（7 阶段分层教学）、CFOP 进阶法（Cross/F2L/OLL/PLL 四阶段）、Kociemba 二阶段算法（约 20 步最优解，基于预计算剪枝表） |
| 3 | **大模型流式对话助手** | SSE 流式输出、逐步解说文案生成（LLM 不可用时自动回退到内置模板）、情绪球 Avatar 动画、可选 TTS 语音播报；对话时自动注入魔方实时状态作为上下文 |
| 4 | **摄像头视觉录入实体魔方** | 前端调用摄像头逐面拍摄，后端通过 YOLOv8（Roboflow 云端推理）检测魔方包围盒，OpenCV 按 3×3 网格采样贴纸颜色并用 HSV 分类为六面色，支持手动旋转校正与合法性校验 |
| 5 | **3D 拟真交互与教学播放** | Three.js 渲染的多阶魔方，支持触控转动、打乱、撤销、计时训练、解法路径逐步播放（3D 动画与解说同步）、公式库（F2L/OLL/PLL）、动画导出 GIF/PNG |

### 界面模式

- **首页**：项目主视觉与快速入口
- **规则图鉴**：魔方结构图鉴 + 全套 CFOP 公式库分步播放
- **教学台**：录入魔方（涂色 / 摄像头扫描）→ 魔方还原（选择解法引擎，跟随 3D 动画分步学习）
- **计时训练**：打乱计时、毫秒级计时器、历史复盘
- **AI 助手侧边栏**：随时对话提问，支持「下一步怎么做」「检查魔方状态」「开始教学」等指令
- **设置**：动画导演、阶数、镜头、控制、显示、配色

---

## 二、系统架构

```
┌────────────────────────  前端（React 19 + Vite + Three.js）───────────────────────┐
│  3D 魔方渲染/交互   教学播放器   摄像头采集(getUserMedia)   ChatPanel(SSE 流式对话)  │
└──────────────┬──────────────────────┬───────────────────────────┬────────────────┘
               │ REST /api/*          │ POST /detect (图像帧)      │ SSE /api/agent/stream_chat
┌──────────────▼──────────────────────▼───────────────────────────▼────────────────┐
│                          后端服务层（FastAPI, :8000）                              │
│  routes_state（状态同步/打乱/转动）  routes_solve（求解/Agent/配置/TTS）            │
│  routes_detect（视觉检测）                                                        │
├───────────────────────────────────────────────────────────────────────────────┤
│  Agent 智能体层：Agent ──MCP JSON-RPC(内存传输)──► MCP Server "cubetutor"         │
│    工具: get_cube_state / validate_state / get_solution / apply_move             │
├───────────────────────────────────────────────────────────────────────────────┤
│  业务核心层 core：54-facelet 状态模型、转动引擎、群论合法性校验、共享会话           │
│  求解器层 solvers：beginner（层先）/ cfop / kociemba（二阶段+预计算表）            │
│  视觉层 cv：YOLOv8(Roboflow) 检测 + OpenCV HSV 颜色分类                           │
├───────────────────────────────────────────────────────────────────────────────┤
│  外部服务：OpenAI 兼容 LLM API（DeepSeek/通义千问/OpenRouter/SiliconFlow 等）      │
│           可选 TTS 语音合成 API    Roboflow 云端推理 API                          │
└───────────────────────────────────────────────────────────────────────────────┘
```

### MCP 工具定义（Tools）

MCP Server（`server/agent/mcp_server.py`）以标准 MCP 协议暴露 4 个工具，Agent 通过 SDK 的内存传输以真实 JSON-RPC 调用：

| 工具 | 入参 | 返回 | 作用 |
|------|------|------|------|
| `get_cube_state` | — | 54 字符 facelet 串 | 读取魔方当前状态（感知） |
| `validate_state` | `facelets?` | `{ok, reason?}` | 群论合法性校验（颜色计数、置换奇偶性、朝向约束） |
| `get_solution` | `method` | 分步 Solution JSON | 调用指定求解器计算还原路径（含阶段标注） |
| `apply_move` | `move, facelets?` | 新状态串 | 施加单步转动；带 `facelets` 时为无状态推演，不污染共享会话 |

MCP Server 也可独立运行：`cd server && python -m agent.mcp_server`，供任意 MCP 客户端（如 Claude Desktop、Cursor）接入。

### 大模型技术方案

- **模型选型**：后端通过 OpenAI 兼容接口对接任意大模型，已适配 DeepSeek、通义千问（DashScope）、OpenRouter、SiliconFlow、Moonshot 等主流服务商，可在前端「⚙️ 设置」面板在线切换与连通性测试
- **Prompt 工程**：System Prompt 注入六面颜色基准、平台功能知识库与魔方 2D 展开图实时状态，约束回答风格与教学口径；分步解说采用「批量步骤 → JSON 数组解说」的结构化生成策略
- **Agent 工作流**：意图识别（下一步指引 / 完整教学 / 状态检查 / 自由问答）→ MCP 工具链调用 → 解法推演 → LLM 生成解说 → SSE 流式返回（附带工具调用轨迹与情绪 ID）
- **鲁棒性兜底**：LLM 超时或未配置时自动回退到内置中文解说模板；MCP 内存传输异常时降级为直连共享会话，保证教学主流程永远可用

---

## 三、技术栈

| 层 | 技术 |
|----|------|
| 前端 | TypeScript、React 19、Vite、Three.js、SSE、WebRTC（getUserMedia） |
| 后端 | Python 3.10+、FastAPI、Uvicorn、Pydantic、httpx |
| 大模型 | OpenAI 兼容 Chat Completions（DeepSeek / Qwen / GPT 等均可），可选 TTS |
| Agent / 协议 | MCP（Model Context Protocol）JSON-RPC，官方 `mcp` Python SDK |
| 算法 | 自研层先法与 CFOP 求解器、RubikTwoPhase（Kociemba 二阶段） |
| 视觉 | YOLOv8（Roboflow 云端推理，`cuber-server/` 内含自训练脚本与数据集）、OpenCV、Pillow |
| 测试 | pytest、anyio |

---

## 四、目录结构

```
cuber-src/
├── src/                       # 前端源码
│   ├── index.tsx              # 应用主入口（模式路由、3D 舞台、教学台）
│   ├── components/ChatPanel.tsx  # AI 助手对话面板（SSE 流式、工具轨迹、语音）
│   ├── avatar/                # 情绪球 Avatar 动画引擎
│   ├── cv/scanner.ts          # 摄像头采集、六面网格映射与前端校验
│   ├── cuber/                 # 3D 魔方核心（渲染、转动、动画）
│   └── shell/                 # 顶部导航、首页、路由
├── server/                    # 后端源码
│   ├── api/                   # FastAPI 路由（state / solve / detect）
│   ├── agent/                 # Agent、MCP Server/Client、LLM、TTS、配置
│   ├── core/                  # 魔方状态模型、转动、校验、共享会话
│   ├── solvers/               # beginner / cfop / kociemba 三种求解器
│   ├── cv/                    # YOLOv8 检测与 HSV 颜色分类
│   └── tests/                 # pytest 单元测试（9 个测试模块）
├── cuber-server/              # YOLOv8 魔方检测模型训练脚本与数据集
├── requirements.txt           # 后端 Python 依赖
├── package.json               # 前端依赖与启动脚本
├── start.bat                  # Windows 一键启动脚本
└── .env                       # LLM / TTS 配置（需自行填写，勿提交真实 Key）
```

---

## 五、部署与运行

### 环境要求

- Node.js 18+
- Python 3.10+
- 现代浏览器（Chrome/Edge，摄像头录入需授权摄像头权限）

### 方式一：Windows 一键启动（推荐）

双击运行根目录的 **`start.bat`**，脚本会自动检查环境、安装前后端依赖，并同时拉起后端（8000）与前端（5173），随后自动打开浏览器。

### 方式二：手动启动

```bash
# 1. 安装前端依赖
npm install --legacy-peer-deps

# 2. 安装后端依赖
python -m pip install -r requirements.txt

# 3. 一条命令同时启动前后端（concurrently）
npm start
```

也可分开启动：

```bash
# 后端（FastAPI, :8000）
python -m uvicorn --app-dir server api.http_app:app --port 8000 --reload

# 前端（Vite, :5173）
npm run dev
```

### 配置大模型（二选一）

1. **前端配置**：启动后点击 AI 助手面板右上角「⚙️ 设置」，填入 Base URL、API Key 与模型名，支持在线拉取模型列表与连通性测试，保存后即时生效；
2. **文件配置**：编辑根目录 `.env`：

```env
LLM_BASE_URL=https://api.deepseek.com/v1   # OpenAI 兼容接口地址
LLM_API_KEY=sk-xxxx                        # 你的 API Key
LLM_MODEL=deepseek-chat                    # 模型名
TTS_BASE_URL=                              # 可选：OpenAI 兼容 TTS 地址
TTS_API_KEY=                               # 可选：TTS Key
```

> 未配置 LLM 时系统仍可完整运行：求解、MCP 工具链、分步教学均正常，解说文案自动使用内置模板。

### 运行测试

```bash
cd server
python -m pytest tests -v
```

测试覆盖：三种求解器正确性、状态合法性校验、MCP 工具注册与调用、Agent 降级兜底、HTTP 接口冒烟。

---

## 六、主要 API 一览

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/state` | GET / POST | 读取 / 设置魔方 54 格状态（POST 时做合法性校验） |
| `/api/scramble` | POST | 随机打乱（返回打乱序列） |
| `/api/move` | POST | 施加单步转动 |
| `/api/solve` | POST | 直接调用求解器（beginner / cfop / kociemba） |
| `/api/solve_with_agent` | POST | Agent 经 MCP 工具链求解并生成分步解说 |
| `/api/agent/chat` | POST | 对话式 Agent（意图识别 + 工具调用 + LLM 兜底） |
| `/api/agent/stream_chat` | POST | SSE 流式对话（含工具调用轨迹与情绪事件） |
| `/api/agent/config` | GET / POST | 读取 / 更新 LLM 与 TTS 配置 |
| `/api/agent/test_llm` | POST | LLM 连通性测试 |
| `/api/tts` | GET | 文本转语音（未配置时返回 204） |
| `/detect` | POST | 上传图像帧，YOLOv8 检测魔方并返回 3×3 贴纸颜色网格 |
| `/api/health` | GET | 健康检查 |

---

## 七、安全性、隐私与鲁棒性设计

- **Prompt 注入防护**：用户输入仅作为 user 消息传入，System Prompt 固定注入且对用户不可见；求解等关键操作走确定性算法与 MCP 工具，不由 LLM 自由生成转动指令，杜绝模型幻觉导致错误教学
- **模型幻觉兜底**：所有还原步骤均由求解器计算并经 `validate_state` 群论校验；LLM 只负责「解说」，解说生成失败自动回退中文模板
- **输入校验**：54 格状态在前后端双重校验（颜色计数、中心块、置换/朝向合法性），非法状态直接拒绝求解并给出原因
- **隐私**：摄像头图像仅用于单帧检测，不落盘存储；API Key 保存在本地 `.env`，不上传；`.env` 已加入 `.gitignore`，请勿将真实 Key 提交到仓库
- **降级链路**：LLM 不可用 → 模板解说；MCP 内存传输异常 → 直连共享会话；Roboflow 检测失败 → 前端提示重拍并支持手动涂色录入

---

## 八、与任务书要求对照

| 任务书要求 | 本项目对应实现 |
|------------|----------------|
| MCP Tools/Resources 定义 | 4 个标准 MCP 工具（见第二节），可独立运行供任意 MCP 客户端接入 |
| 大模型选型与 Prompt 设计 | OpenAI 兼容多厂商接入 + 结构化 System Prompt + 分步解说生成策略 |
| Agent 链 / 工作流 | 意图识别 → MCP 工具链 → 求解推演 → LLM 解说 → SSE 流式返回 |
| 多模态 / 视觉 | YOLOv8 魔方检测 + HSV 颜色分类，实体魔方一键数字化 |
| 核心 Demo | 求解教学、MCP Agent 对话、视觉录入、3D 同步播放均可现场演示 |
| 安全性考量 | 见第七节 |

---

## 致谢与许可

- 3D 魔方渲染基础源自开源项目 [cuber](https://gitee.com/huazhechen/cuber)（MIT License），本项目在其上重构为 React 架构并扩展了 MCP / Agent / 视觉 / 大模型教学能力
- Kociemba 二阶段算法基于 [RubikTwoPhase](https://pypi.org/project/RubikTwoPhase/)
- 本项目遵循 MIT License，详见 [LICENSE](LICENSE)
