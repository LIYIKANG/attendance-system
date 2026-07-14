# 员工打卡管理系统

一个轻量的企业考勤系统：员工打卡、考勤日历、员工与账户管理、月度薪资统计（支持兼职按天 / 全职按月结算）、数据看板与 Excel 导出。

- 后端：Node.js + Express
- 存储：MySQL，**无数据库时自动降级到 JSON 文件**（`data/db.json`），便于本地演示
- 前端：原生 HTML / CSS / JS（无需构建）

## 功能一览

- 🔐 登录鉴权（管理员 / 员工两种角色）
- 📊 数据概览：今日打卡、迟到、在职人数、本月工资合计，含饼图 / 条形图
- ✅ 员工打卡：上/下班打卡，自动判定正常 / 迟到 / 早退
- 🗓️ 考勤日历：**所有员工均可查看**全体的打卡时间与状态，点击日期看当天明细
- 👥 员工管理：新增员工时可同时创建登录账户与密码；区分兼职（按天）/ 全职（按月）
- 📅 月度总结：出勤、缺勤、出勤率与应发工资
- ⚙️ 系统设置 & 📤 Excel 导出

---

## 一、本地快速启动（无需数据库）

> 需要 Node.js 20（AdminJS 依赖较旧的 import 语法，Node 22+ 可能无法启动）。

```bash
npm install
cp .env.example .env
npm start
```

打开 http://localhost:3000 

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
1. 生成 `.env` 并写入随机 `JWT_SECRET`；
2. 构建镜像并启动 `app`（应用）+ `db`（MySQL）两个容器；
3. 输出访问地址。

部署完成后访问 `http://<服务器IP>:3000`（后台 `/admin`）。

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
| `DB_PASSWORD` | MySQL root 密码（应用与数据库共用） | `123456` |
| `JWT_SECRET` | 登录令牌签名密钥（部署脚本会自动生成随机值） | 随机 |

> ⚠️ 数据库端口 3306 默认对外映射，生产环境如无需外部访问，建议在 `docker-compose.yml` 中删除 `db` 的 `ports` 段。

---

## 三、数据与安全说明

- `.env` 与 `data/db.json`（含员工信息与密码散列）已在 `.gitignore` 中排除，不会提交到仓库。
- 生产环境请务必：修改默认管理员密码、设置强 `DB_PASSWORD`、使用 `deploy.sh` 生成的随机 `JWT_SECRET`。
- MySQL 数据持久化在 Docker 卷 `db_data` 中；JSON 兜底数据持久化在宿主机 `./data` 目录。
