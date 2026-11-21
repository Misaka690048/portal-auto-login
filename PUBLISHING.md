# 打包与发布

## 三种格式

- `extension/`：源码目录，通过“加载已解压的扩展程序”安装。目前本机使用这种方式，适合开发和调试。
- `dist/portal-auto-login.zip`：只包含扩展运行文件的 ZIP。适合放到 GitHub Releases，下载者解压后加载，也可用于 Chrome Web Store 上传。
- `.crx`：Chrome 签名扩展包。不能把 ZIP 改后缀当作 CRX。CRX 与源码发布是两回事。

## 生成 ZIP

在项目根目录执行：

```bash
python3 scripts/package.py
```

输出为 `dist/portal-auto-login.zip`，根层包含 `manifest.json`。用户截图、保存的认证页面、测试文件都不会进入安装包。

## 在 Ubuntu / Chrome 打包 CRX

1. 打开 `chrome://extensions`，开启“开发者模式”。
2. 点击“打包扩展程序”。
3. 扩展根目录选本项目的 `extension` 文件夹。本机路径为 `/home/syz/code/portal-auto-login/extension`。
4. 第一次打包时，“私钥文件”留空，然后点击“打包扩展程序”。
5. Chrome 会在扩展目录旁生成 `extension.crx` 和 `extension.pem`。

`.crx` 可以作为发行附件；`.pem` 是签名私钥，只由你保管并备份，不能上传 GitHub 或作为附件发送。以后先提高 `manifest.json` 的版本号，再选择同一个 `.pem` 重新打包，以保持相同的扩展身份。

Linux 支持商店外分发。Windows/macOS 的普通 Chrome 安装受商店分发限制，不能保证收到 CRX 就能安装；给其他系统的同学分享时，可提供 ZIP 解压加载，或走 Chrome Web Store。商店外自动更新还需要更新清单和托管配置；仅把 CRX 附加到 GitHub Release 不等于已经配置自动更新。

参考：[Chrome 官方 Linux 打包与托管说明](https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux)。

## 发布 GitHub 源码

此前的本地 Git 初始化已按用户要求撤销，目前没有 Git 仓库，也没有上传 GitHub。以下仅为用户自行操作时的参考步骤。

1. 在 GitHub 创建名为 `portal-auto-login` 的空仓库。选择公开或私有；创建时不要勾选生成 README、.gitignore 或许可证，避免与本地内容产生初始提交冲突。
2. 回到项目目录，检查待提交文件并提交：

```bash
cd /home/syz/code/portal-auto-login
git init -b main
git status --short
git add .
git diff --cached --stat
git commit -m "Initial release of portal-auto-login"
```

如果 Git 提示没有身份，先在这个仓库里设置你的署名（自行替换示例值）：

```bash
git config user.name "你的 GitHub 用户名"
git config user.email "你的 GitHub 提交邮箱"
```

然后重试 `git commit`。邮箱可以使用 GitHub 设置页提供的 noreply 邮箱。

3. 使用刚创建仓库页面上的实际远程地址，替换下面的 `YOUR_USERNAME`：

```bash
git remote add origin https://github.com/YOUR_USERNAME/portal-auto-login.git
git push -u origin main
```

推送需要你的 GitHub 身份验证。HTTPS 通常使用凭据管理器或个人访问令牌，不使用 GitHub 网站登录密码；也可改用已配置 SSH 密钥对应的仓库地址。不要把令牌写进远程 URL、项目文件或聊天消息。

执行 `git add .` 前，请自行创建 `.gitignore`，排除 `page-source/`、`prtsc/`、`dist/`、`*.crx`、`*.pem`、`*.key` 和本地环境文件。源码、图标、测试和文档会纳入版本控制。普通克隆者没有本地认证页快照时，源码回归测试会自动跳过，其余测试可照常执行。

参考：[GitHub 官方导入本地项目说明](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)。

## 发布可下载版本

推送源码后，在仓库的 Releases 页面创建新版本：

- Tag：`v0.3.0`（或以后的实际版本）。
- Title：`portal-auto-login v0.3.0`。
- 描述：填写本次改动和安装方法。
- 附件：上传 `dist/portal-auto-login.zip`，如需要也可附上已生成的 CRX；不要上传 PEM。

发布源码和选择开源许可证是两件事。目前没有自动为项目添加许可证；如果希望明确允许他人使用、修改和分发，请再选择适合你的许可证。校徽不表示项目获得学校官方背书。

## Chrome Web Store

若需要用户从商店安装、由商店分发更新，则注册开发者账号，在开发者控制台新建条目并上传 ZIP，填写商店资料、权限用途和隐私相关说明后提交审核。商店会处理 CRX 分发。GitHub 仓库或 Release 不会自动成为商店条目。

参考：[Chrome Web Store 官方发布步骤](https://developer.chrome.com/docs/webstore/publish)。
