# 员工打卡管理系统

一个轻量的企业考勤系统：员工打卡、考勤日历、员工与账户管理、月度薪资统计（支持兼职按天 / 全职按月结算）、数据看板与 Excel 导出。

- 后端：Node.js + Express
- 存储：MySQL，**无数据库时自动降级到 JSON 文件**（`data/db.json`），便于本地演示
- 前端：原生 HTML / CSS / JS（无需构建）

## 功能一览

- 🔐 登录鉴权（管理员 / 员工两种角色，支持密码修改与令牌即时失效）
- 📊 数据概览：今日打卡、迟到、在职人数、本月工资合计，含饼图 / 条形图
- ✅ 员工打卡：上/下班打卡，自动判定正常 / 迟到 / 早退
- ☕ 工作状态：支持上班、休息、继续上班、下班及一天多段休息
- 🧭 分级管理：员工 → 项目管理人 → 管理者 → 系统管理员
- 📝 考勤修正：员工可修正自己的历史日期与时间，原始内容、当时汇报链和逐人已读状态永久留痕
- 🗓️ 考勤日历：管理员查看全体员工的打卡时间与状态，点击日期查看当天明细
- 👥 员工管理：新增员工时可同时创建登录账户与密码；区分兼职（按天）/ 全职（按月）
- 📁 人员档案：管理员可为员工上传、下载和删除简历与劳动合同，表格实时显示资料数量
- 📅 月度总结：出勤、缺勤、出勤率与应发工资
- ⚙️ 系统设置 & 📤 Excel 导出

普通员工登录后仅显示“打卡”和“历史记录”。项目管理人、管理者可额外查看下属的考勤修改上报；系统管理员可配置组织关系并查看全部修改审计。

---

## 一、本地快速启动（无需数据库）

> 推荐使用 Node.js 20 LTS（Docker 镜像已固定为 Node.js 20）。

```bash
npm install
cp .env.example .env
npm start
```

打开 http://localhost:3000。

未配置 MySQL 时会自动使用 `data/db.json` 存储，首次启动自动生成示例数据。

---

## 二、一键部署到服务器（推荐 · Docker）

服务器只需装好 **Docker** 与 **Docker Compose**，然后：

```bash
git clone https://github.com/LIYIKANG/attendance-system.git
cd attendance-system
chmod +x deploy.sh
./deploy.sh
```

脚本会自动：
1. 生成权限为 `600` 的 `.env`，写入随机 JWT、管理员、MySQL 应用用户与 root 密码；
2. 校验配置并构建 `app`（应用）+ `db`（MySQL）两个容器；
3. 等待数据库和应用健康检查通过；
4. 输出访问地址与随机管理员初始密码。

部署完成后访问 `http://<服务器IP>:3000`，使用脚本输出的管理员账号密码登录。

MySQL 的 `3306` 端口默认只在 Docker 内部网络使用，不会暴露到公网。生产模式下数据库不可用时应用会停止并等待容器重启，不会悄悄切换到 JSON 数据。

### 常用运维命令

```bash
docker compose logs -f app     # 查看应用日志
docker compose ps              # 查看容器状态
docker compose down            # 停止并移除容器（数据保留在 db_data 卷中）
git pull && ./deploy.sh        # 拉取更新并重新部署
```

### 自定义配置

编辑 `.env` 后重新运行 `./deploy.sh` 生效：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 对外访问端口 | `3000` |
| `DB_NAME` | 数据库名 | `attendance_db` |
| `DB_USER` | MySQL 应用账号 | `attendance` |
| `DB_PASSWORD` | MySQL 应用账号密码 | 首次部署随机生成 |
| `DB_ROOT_PASSWORD` | MySQL root 密码 | 首次部署随机生成 |
| `JWT_SECRET` | 登录令牌签名密钥（部署脚本会自动生成随机值） | 随机 |
| `ADMIN_PASSWORD` | 系统管理员初始密码 | 首次部署随机生成 |
| `COOKIE_SECURE` | 反向代理启用 HTTPS 后设为 `true` | `false` |
| `TRUST_PROXY` | 使用 Nginx/Caddy 反向代理时设为 `true` | `false` |
| `REQUIRE_DATABASE` | 数据库不可用时拒绝启动 | Docker 中为 `true` |

若通过 Nginx/Caddy 配置 HTTPS，请同时把 `.env` 中 `COOKIE_SECURE=true` 与 `TRUST_PROXY=true`，然后重新执行 `./deploy.sh`。

---

## 三、数据与安全说明

- `.env` 与 `data/db.json`（含员工信息与密码散列）已在 `.gitignore` 中排除，不会提交到仓库。
- 简历与合同原文件保存在 `data/uploads`（Docker 中为 `json_data` 卷），目录不会进入 Git 或 Docker 构建上下文；只有系统管理员可以访问。
- 人员资料仅支持 PDF、Word、PNG、JPG，单文件限制为 15MB；删除员工时会同步删除其简历和合同。
- `deploy.sh` 会拒绝使用默认或过短的生产密钥；应用本身也会在生产配置不安全时拒绝启动。
- 密码采用随机盐 scrypt 存储；旧版本 SHA-256 密码会在成功登录后自动升级。
- 删除员工会删除登录账号和原始考勤，但保留不可变的修改审计；有直属下属时必须先转移下属。
- 全职缺勤只按截至今天的周一至周五计算，不扣周末和未来日期。
- MySQL 数据持久化在 Docker 卷 `db_data` 中；Docker 内的 JSON 兜底数据持久化在 `json_data` 卷中。
