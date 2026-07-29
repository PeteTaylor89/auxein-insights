2026-07-28T19:38:45.9453726Z Current runner version: '2.336.0'
2026-07-28T19:38:45.9474294Z ##[group]Runner Image Provisioner
2026-07-28T19:38:45.9475143Z Hosted Compute Agent
2026-07-28T19:38:45.9475758Z Version: 20260707.563
2026-07-28T19:38:45.9476377Z Commit: 02667638d2b423fbc733a8e32a88b44996a3ba6e
2026-07-28T19:38:45.9477077Z Build Date: 2026-07-07T19:33:50Z
2026-07-28T19:38:45.9477728Z Worker ID: {31b6e904-8bd3-420f-bf19-78e130bf48b0}
2026-07-28T19:38:45.9478451Z Azure Region: westus3
2026-07-28T19:38:45.9479038Z ##[endgroup]
2026-07-28T19:38:45.9480433Z ##[group]Operating System
2026-07-28T19:38:45.9481026Z Ubuntu
2026-07-28T19:38:45.9481613Z 24.04.4
2026-07-28T19:38:45.9482091Z LTS
2026-07-28T19:38:45.9482629Z ##[endgroup]
2026-07-28T19:38:45.9483407Z ##[group]Runner Image
2026-07-28T19:38:45.9484005Z Image: ubuntu-24.04
2026-07-28T19:38:45.9484577Z Version: 20260720.247.2
2026-07-28T19:38:45.9485694Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260720.247/images/ubuntu/Ubuntu2404-Readme.md
2026-07-28T19:38:45.9486982Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260720.247
2026-07-28T19:38:45.9487821Z ##[endgroup]
2026-07-28T19:38:45.9488939Z ##[group]GITHUB_TOKEN Permissions
2026-07-28T19:38:45.9491072Z Contents: read
2026-07-28T19:38:45.9491639Z Metadata: read
2026-07-28T19:38:45.9492129Z Packages: read
2026-07-28T19:38:45.9492697Z ##[endgroup]
2026-07-28T19:38:45.9494441Z Secret source: Actions
2026-07-28T19:38:45.9495437Z Prepare workflow directory
2026-07-28T19:38:45.9753513Z Prepare all required actions
2026-07-28T19:38:45.9802045Z Getting action download info
2026-07-28T19:38:46.2945268Z Download action repository 'actions/checkout@v4' (SHA:11d5960a326750d5838078e36cf38b85af677262)
2026-07-28T19:38:46.9167732Z Download action repository 'actions/setup-python@v5' (SHA:a26af69be951a213d495a4c3e4e4022e16d87065)
2026-07-28T19:38:47.0796380Z Complete job name: ingest-weather
2026-07-28T19:38:47.1445514Z Node 20 is being deprecated. This workflow is running with Node 24 by default. If you need to temporarily use Node 20, you can set the ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true environment variable. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
2026-07-28T19:38:47.1453186Z ##[group]Run actions/checkout@v4
2026-07-28T19:38:47.1453936Z with:
2026-07-28T19:38:47.1454461Z   repository: PeteTaylor89/auxein-insights
2026-07-28T19:38:47.1458176Z   token: ***
2026-07-28T19:38:47.1458771Z   ssh-strict: true
2026-07-28T19:38:47.1459275Z   ssh-user: git
2026-07-28T19:38:47.1459838Z   persist-credentials: true
2026-07-28T19:38:47.1460570Z   clean: true
2026-07-28T19:38:47.1461124Z   sparse-checkout-cone-mode: true
2026-07-28T19:38:47.1461691Z   fetch-depth: 1
2026-07-28T19:38:47.1462216Z   fetch-tags: false
2026-07-28T19:38:47.1462750Z   show-progress: true
2026-07-28T19:38:47.1463277Z   lfs: false
2026-07-28T19:38:47.1463885Z   submodules: false
2026-07-28T19:38:47.1464430Z   set-safe-directory: true
2026-07-28T19:38:47.1465022Z   allow-unsafe-pr-checkout: false
2026-07-28T19:38:47.1465787Z ##[endgroup]
2026-07-28T19:38:47.2340700Z Syncing repository: PeteTaylor89/auxein-insights
2026-07-28T19:38:47.2344606Z ##[group]Getting Git version info
2026-07-28T19:38:47.2345970Z Working directory is '/home/runner/work/auxein-insights/auxein-insights'
2026-07-28T19:38:47.2347734Z [command]/usr/bin/git version
2026-07-28T19:38:47.3131100Z git version 2.54.0
2026-07-28T19:38:47.3146995Z ##[endgroup]
2026-07-28T19:38:47.3157634Z Temporarily overriding HOME='/home/runner/work/_temp/6983025d-8a8f-4f65-b581-853da3613f6e' before making global git config changes
2026-07-28T19:38:47.3158969Z Adding repository directory to the temporary git global config as a safe directory
2026-07-28T19:38:47.3162264Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/auxein-insights/auxein-insights
2026-07-28T19:38:47.3190377Z Deleting the contents of '/home/runner/work/auxein-insights/auxein-insights'
2026-07-28T19:38:47.3193812Z ##[group]Initializing the repository
2026-07-28T19:38:47.3197338Z [command]/usr/bin/git init /home/runner/work/auxein-insights/auxein-insights
2026-07-28T19:38:47.3271728Z hint: Using 'master' as the name for the initial branch. This default branch name
2026-07-28T19:38:47.3273003Z hint: will change to "main" in Git 3.0. To configure the initial branch name
2026-07-28T19:38:47.3274387Z hint: to use in all of your new repositories, which will suppress this warning,
2026-07-28T19:38:47.3275383Z hint: call:
2026-07-28T19:38:47.3275969Z hint:
2026-07-28T19:38:47.3276639Z hint: 	git config --global init.defaultBranch <name>
2026-07-28T19:38:47.3277273Z hint:
2026-07-28T19:38:47.3278145Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
2026-07-28T19:38:47.3279002Z hint: 'development'. The just-created branch can be renamed via this command:
2026-07-28T19:38:47.3279766Z hint:
2026-07-28T19:38:47.3280551Z hint: 	git branch -m <name>
2026-07-28T19:38:47.3281119Z hint:
2026-07-28T19:38:47.3281759Z hint: Disable this message with "git config set advice.defaultBranchName false"
2026-07-28T19:38:47.3282798Z Initialized empty Git repository in /home/runner/work/auxein-insights/auxein-insights/.git/
2026-07-28T19:38:47.3284589Z [command]/usr/bin/git remote add origin https://github.com/PeteTaylor89/auxein-insights
2026-07-28T19:38:47.3305578Z ##[endgroup]
2026-07-28T19:38:47.3306570Z ##[group]Disabling automatic garbage collection
2026-07-28T19:38:47.3308195Z [command]/usr/bin/git config --local gc.auto 0
2026-07-28T19:38:47.3331736Z ##[endgroup]
2026-07-28T19:38:47.3332619Z ##[group]Setting up auth
2026-07-28T19:38:47.3336214Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-07-28T19:38:47.3360440Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-07-28T19:38:47.3623069Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-07-28T19:38:47.3648224Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-07-28T19:38:47.3810526Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
2026-07-28T19:38:47.3834932Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
2026-07-28T19:38:47.3993044Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
2026-07-28T19:38:47.5480536Z ##[endgroup]
2026-07-28T19:38:47.5482008Z ##[group]Fetching the repository
2026-07-28T19:38:47.5488146Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +08769f92bee750644a5eff29cd660fd7beb2dc33:refs/remotes/origin/main
2026-07-28T19:38:52.7879320Z From https://github.com/PeteTaylor89/auxein-insights
2026-07-28T19:38:52.7883645Z  * [new ref]         08769f92bee750644a5eff29cd660fd7beb2dc33 -> origin/main
2026-07-28T19:38:52.7901328Z ##[endgroup]
2026-07-28T19:38:52.7903482Z ##[group]Determining the checkout info
2026-07-28T19:38:52.7905924Z ##[endgroup]
2026-07-28T19:38:52.7907839Z [command]/usr/bin/git sparse-checkout disable
2026-07-28T19:38:52.7940312Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
2026-07-28T19:38:52.7965953Z ##[group]Checking out the ref
2026-07-28T19:38:52.7968485Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
2026-07-28T19:38:53.5804805Z Switched to a new branch 'main'
2026-07-28T19:38:53.5805724Z branch 'main' set up to track 'origin/main'.
2026-07-28T19:38:53.5829699Z ##[endgroup]
2026-07-28T19:38:53.5861420Z [command]/usr/bin/git log -1 --format=%H
2026-07-28T19:38:53.5882230Z 08769f92bee750644a5eff29cd660fd7beb2dc33
2026-07-28T19:38:53.6112888Z Node 20 is being deprecated. This workflow is running with Node 24 by default. If you need to temporarily use Node 20, you can set the ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true environment variable. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
2026-07-28T19:38:53.6114562Z ##[group]Run actions/setup-python@v5
2026-07-28T19:38:53.6115006Z with:
2026-07-28T19:38:53.6115376Z   python-version: 3.11
2026-07-28T19:38:53.6115771Z   check-latest: false
2026-07-28T19:38:53.6118106Z   token: ***
2026-07-28T19:38:53.6118450Z   update-environment: true
2026-07-28T19:38:53.6118889Z   allow-prereleases: false
2026-07-28T19:38:53.6119266Z   freethreaded: false
2026-07-28T19:38:53.6119633Z ##[endgroup]
2026-07-28T19:38:53.7235447Z ##[group]Installed versions
2026-07-28T19:38:53.8240478Z (node:2027) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
2026-07-28T19:38:53.8243052Z (Use `node --trace-deprecation ...` to show where the warning was created)
2026-07-28T19:38:53.8243865Z Successfully set up CPython (3.11.15)
2026-07-28T19:38:53.8244964Z ##[endgroup]
2026-07-28T19:38:53.8360932Z ##[group]Run sudo apt-get update
2026-07-28T19:38:53.8361532Z [36;1msudo apt-get update[0m
2026-07-28T19:38:53.8361945Z [36;1msudo apt-get install -y postgresql-client[0m
2026-07-28T19:38:53.8402085Z shell: /usr/bin/bash -e {0}
2026-07-28T19:38:53.8402575Z env:
2026-07-28T19:38:53.8402955Z   pythonLocation: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T19:38:53.8403435Z   PKG_CONFIG_PATH: /opt/hostedtoolcache/Python/3.11.15/x64/lib/pkgconfig
2026-07-28T19:38:53.8403924Z   Python_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T19:38:53.8404401Z   Python2_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T19:38:53.8404806Z   Python3_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T19:38:53.8405251Z   LD_LIBRARY_PATH: /opt/hostedtoolcache/Python/3.11.15/x64/lib
2026-07-28T19:38:53.8405657Z ##[endgroup]
2026-07-28T19:38:54.1122443Z Get:1 file:/etc/apt/apt-mirrors.txt Mirrorlist [144 B]
2026-07-28T19:38:54.1581500Z Hit:6 https://packages.microsoft.com/repos/azure-cli noble InRelease
2026-07-28T19:38:54.1588851Z Hit:2 http://azure.archive.ubuntu.com/ubuntu noble InRelease
2026-07-28T19:38:54.1590532Z Get:7 https://packages.microsoft.com/ubuntu/24.04/prod noble InRelease [3600 B]
2026-07-28T19:38:54.1633289Z Get:3 http://azure.archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]
2026-07-28T19:38:54.1713231Z Get:4 http://azure.archive.ubuntu.com/ubuntu noble-backports InRelease [126 kB]
2026-07-28T19:38:54.1826242Z Get:5 http://azure.archive.ubuntu.com/ubuntu noble-security InRelease [126 kB]
2026-07-28T19:38:54.2205839Z Get:8 https://dl.google.com/linux/chrome-stable/deb stable InRelease [2548 B]
2026-07-28T19:38:54.3093653Z Get:9 https://packages.microsoft.com/ubuntu/24.04/prod noble/main armhf Packages [11.7 kB]
2026-07-28T19:38:54.3214207Z Get:10 https://packages.microsoft.com/ubuntu/24.04/prod noble/main amd64 Packages [252 kB]
2026-07-28T19:38:54.3288719Z Get:11 https://packages.microsoft.com/ubuntu/24.04/prod noble/main arm64 Packages [218 kB]
2026-07-28T19:38:54.3471804Z Get:12 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages [1153 kB]
2026-07-28T19:38:54.3549151Z Get:13 http://azure.archive.ubuntu.com/ubuntu noble-updates/main Translation-en [278 kB]
2026-07-28T19:38:54.3571841Z Get:14 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 Components [180 kB]
2026-07-28T19:38:54.3578788Z Get:15 http://azure.archive.ubuntu.com/ubuntu noble-updates/universe amd64 Packages [1679 kB]
2026-07-28T19:38:54.3671291Z Get:16 http://azure.archive.ubuntu.com/ubuntu noble-updates/universe Translation-en [334 kB]
2026-07-28T19:38:54.3712632Z Get:17 http://azure.archive.ubuntu.com/ubuntu noble-updates/universe amd64 Components [389 kB]
2026-07-28T19:38:54.3751454Z Get:18 http://azure.archive.ubuntu.com/ubuntu noble-updates/restricted amd64 Packages [1367 kB]
2026-07-28T19:38:54.3802021Z Get:19 http://azure.archive.ubuntu.com/ubuntu noble-updates/restricted Translation-en [308 kB]
2026-07-28T19:38:54.3819238Z Get:20 http://azure.archive.ubuntu.com/ubuntu noble-updates/multiverse amd64 Packages [45.4 kB]
2026-07-28T19:38:54.3828091Z Get:21 http://azure.archive.ubuntu.com/ubuntu noble-updates/multiverse Translation-en [12.3 kB]
2026-07-28T19:38:54.4257504Z Get:22 http://azure.archive.ubuntu.com/ubuntu noble-updates/multiverse amd64 Components [940 B]
2026-07-28T19:38:54.4269203Z Get:23 http://azure.archive.ubuntu.com/ubuntu noble-backports/main amd64 Components [5760 B]
2026-07-28T19:38:54.4275764Z Get:24 http://azure.archive.ubuntu.com/ubuntu noble-backports/universe amd64 Packages [32.5 kB]
2026-07-28T19:38:54.4289478Z Get:25 http://azure.archive.ubuntu.com/ubuntu noble-backports/universe amd64 Components [12.6 kB]
2026-07-28T19:38:54.4300309Z Get:26 http://azure.archive.ubuntu.com/ubuntu noble-security/main amd64 Packages [898 kB]
2026-07-28T19:38:54.4343239Z Get:27 http://azure.archive.ubuntu.com/ubuntu noble-security/main Translation-en [198 kB]
2026-07-28T19:38:54.4360501Z Get:28 http://azure.archive.ubuntu.com/ubuntu noble-security/main amd64 Components [46.3 kB]
2026-07-28T19:38:54.4390788Z Get:29 http://azure.archive.ubuntu.com/ubuntu noble-security/universe amd64 Packages [1199 kB]
2026-07-28T19:38:54.4425618Z Get:30 http://azure.archive.ubuntu.com/ubuntu noble-security/universe Translation-en [239 kB]
2026-07-28T19:38:54.4442689Z Get:31 http://azure.archive.ubuntu.com/ubuntu noble-security/universe amd64 Components [76.2 kB]
2026-07-28T19:38:54.4454257Z Get:32 http://azure.archive.ubuntu.com/ubuntu noble-security/restricted amd64 Packages [1273 kB]
2026-07-28T19:38:54.4539843Z Get:33 http://azure.archive.ubuntu.com/ubuntu noble-security/restricted Translation-en [290 kB]
2026-07-28T19:38:54.4572960Z Get:34 http://azure.archive.ubuntu.com/ubuntu noble-security/multiverse amd64 Packages [40.3 kB]
2026-07-28T19:38:54.4581605Z Get:35 http://azure.archive.ubuntu.com/ubuntu noble-security/multiverse Translation-en [10.6 kB]
2026-07-28T19:38:54.5041283Z Get:36 https://dl.google.com/linux/chrome-stable/deb stable/main amd64 Packages [1424 B]
2026-07-28T19:39:01.6750917Z Fetched 10.9 MB in 1s (8988 kB/s)
2026-07-28T19:39:02.2743061Z Reading package lists...
2026-07-28T19:39:02.3848683Z Reading package lists...
2026-07-28T19:39:02.4942281Z Building dependency tree...
2026-07-28T19:39:02.4951095Z Reading state information...
2026-07-28T19:39:02.7210221Z The following NEW packages will be installed:
2026-07-28T19:39:02.7211402Z   postgresql-client
2026-07-28T19:39:02.7357091Z 0 upgraded, 1 newly installed, 0 to remove and 73 not upgraded.
2026-07-28T19:39:02.7357848Z Need to get 11.6 kB of archives.
2026-07-28T19:39:02.7358651Z After this operation, 17.4 kB of additional disk space will be used.
2026-07-28T19:39:02.7359408Z Get:1 file:/etc/apt/apt-mirrors.txt Mirrorlist [144 B]
2026-07-28T19:39:02.8195329Z Get:2 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 postgresql-client all 16+257build1.1 [11.6 kB]
2026-07-28T19:39:03.1185308Z Fetched 11.6 kB in 0s (127 kB/s)
2026-07-28T19:39:03.1765101Z Selecting previously unselected package postgresql-client.
2026-07-28T19:39:03.1962886Z (Reading database ... 
2026-07-28T19:39:03.1963266Z (Reading database ... 5%
2026-07-28T19:39:03.1963755Z (Reading database ... 10%
2026-07-28T19:39:03.1964225Z (Reading database ... 15%
2026-07-28T19:39:03.1964875Z (Reading database ... 20%
2026-07-28T19:39:03.1965365Z (Reading database ... 25%
2026-07-28T19:39:03.1966018Z (Reading database ... 30%
2026-07-28T19:39:03.1966527Z (Reading database ... 35%
2026-07-28T19:39:03.1967003Z (Reading database ... 40%
2026-07-28T19:39:03.1967439Z (Reading database ... 45%
2026-07-28T19:39:03.1967783Z (Reading database ... 50%
2026-07-28T19:39:03.2008324Z (Reading database ... 55%
2026-07-28T19:39:03.4106975Z (Reading database ... 60%
2026-07-28T19:39:03.6563120Z (Reading database ... 65%
2026-07-28T19:39:03.9182984Z (Reading database ... 70%
2026-07-28T19:39:04.1274821Z (Reading database ... 75%
2026-07-28T19:39:04.2660609Z (Reading database ... 80%
2026-07-28T19:39:04.5119561Z (Reading database ... 85%
2026-07-28T19:39:04.6684257Z (Reading database ... 90%
2026-07-28T19:39:04.8988283Z (Reading database ... 95%
2026-07-28T19:39:04.8988851Z (Reading database ... 100%
2026-07-28T19:39:04.8989399Z (Reading database ... 202954 files and directories currently installed.)
2026-07-28T19:39:04.9029349Z Preparing to unpack .../postgresql-client_16+257build1.1_all.deb ...
2026-07-28T19:39:04.9051876Z Unpacking postgresql-client (16+257build1.1) ...
2026-07-28T19:39:05.0006571Z Setting up postgresql-client (16+257build1.1) ...
2026-07-28T19:39:06.3624804Z 
2026-07-28T19:39:06.3625668Z Running kernel seems to be up-to-date.
2026-07-28T19:39:06.3625979Z 
2026-07-28T19:39:06.3626320Z No services need to be restarted.
2026-07-28T19:39:06.3626572Z 
2026-07-28T19:39:06.3626766Z No containers need to be restarted.
2026-07-28T19:39:06.3627068Z 
2026-07-28T19:39:06.3627314Z No user sessions are running outdated binaries.
2026-07-28T19:39:06.3627624Z 
2026-07-28T19:39:06.3628178Z No VM guests are running outdated hypervisor (qemu) binaries on this host.
2026-07-28T19:39:07.0835598Z ##[group]Run pip install boto3==1.34.0 pydantic==2.5.0 pydantic-settings==2.1.0
2026-07-28T19:39:07.0836247Z [36;1mpip install boto3==1.34.0 pydantic==2.5.0 pydantic-settings==2.1.0[0m
2026-07-28T19:39:07.0836673Z [36;1mcd ingestion[0m
2026-07-28T19:39:07.0836994Z [36;1mpip install -r requirements.txt[0m
2026-07-28T19:39:07.0864531Z shell: /usr/bin/bash -e {0}
2026-07-28T19:39:07.0864892Z env:
2026-07-28T19:39:07.0865292Z   pythonLocation: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T19:39:07.0865789Z   PKG_CONFIG_PATH: /opt/hostedtoolcache/Python/3.11.15/x64/lib/pkgconfig
2026-07-28T19:39:07.0866301Z   Python_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T19:39:07.0866706Z   Python2_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T19:39:07.0867160Z   Python3_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T19:39:07.0867590Z   LD_LIBRARY_PATH: /opt/hostedtoolcache/Python/3.11.15/x64/lib
2026-07-28T19:39:07.0867975Z ##[endgroup]
2026-07-28T19:39:10.8349127Z Collecting boto3==1.34.0
2026-07-28T19:39:10.9170210Z   Downloading boto3-1.34.0-py3-none-any.whl.metadata (6.6 kB)
2026-07-28T19:39:11.1223524Z Collecting pydantic==2.5.0
2026-07-28T19:39:11.1348350Z   Downloading pydantic-2.5.0-py3-none-any.whl.metadata (174 kB)
2026-07-28T19:39:11.2511143Z Collecting pydantic-settings==2.1.0
2026-07-28T19:39:11.2618887Z   Downloading pydantic_settings-2.1.0-py3-none-any.whl.metadata (2.9 kB)
2026-07-28T19:39:11.4914101Z Collecting botocore<1.35.0,>=1.34.0 (from boto3==1.34.0)
2026-07-28T19:39:11.5019528Z   Downloading botocore-1.34.162-py3-none-any.whl.metadata (5.7 kB)
2026-07-28T19:39:12.0930368Z Collecting jmespath<2.0.0,>=0.7.1 (from boto3==1.34.0)
2026-07-28T19:39:12.1039096Z   Downloading jmespath-1.1.0-py3-none-any.whl.metadata (7.6 kB)
2026-07-28T19:39:12.1321074Z Collecting s3transfer<0.10.0,>=0.9.0 (from boto3==1.34.0)
2026-07-28T19:39:12.1446463Z   Downloading s3transfer-0.9.0-py3-none-any.whl.metadata (1.7 kB)
2026-07-28T19:39:12.1632084Z Collecting annotated-types>=0.4.0 (from pydantic==2.5.0)
2026-07-28T19:39:12.1737950Z   Downloading annotated_types-0.8.0-py3-none-any.whl.metadata (15 kB)
2026-07-28T19:39:12.8817817Z Collecting pydantic-core==2.14.1 (from pydantic==2.5.0)
2026-07-28T19:39:12.8934437Z   Downloading pydantic_core-2.14.1-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (6.5 kB)
2026-07-28T19:39:13.1657157Z Collecting typing-extensions>=4.6.1 (from pydantic==2.5.0)
2026-07-28T19:39:13.1767717Z   Downloading typing_extensions-4.16.0-py3-none-any.whl.metadata (3.3 kB)
2026-07-28T19:39:13.2025606Z Collecting python-dotenv>=0.21.0 (from pydantic-settings==2.1.0)
2026-07-28T19:39:13.2134257Z   Downloading python_dotenv-1.2.2-py3-none-any.whl.metadata (27 kB)
2026-07-28T19:39:13.3231862Z Collecting python-dateutil<3.0.0,>=2.1 (from botocore<1.35.0,>=1.34.0->boto3==1.34.0)
2026-07-28T19:39:13.3336809Z   Downloading python_dateutil-2.9.0.post0-py2.py3-none-any.whl.metadata (8.4 kB)
2026-07-28T19:39:13.4262232Z Collecting urllib3!=2.2.0,<3,>=1.25.4 (from botocore<1.35.0,>=1.34.0->boto3==1.34.0)
2026-07-28T19:39:13.4417000Z   Downloading urllib3-2.7.0-py3-none-any.whl.metadata (6.9 kB)
2026-07-28T19:39:13.5056334Z Collecting six>=1.5 (from python-dateutil<3.0.0,>=2.1->botocore<1.35.0,>=1.34.0->boto3==1.34.0)
2026-07-28T19:39:13.5163330Z   Downloading six-1.17.0-py2.py3-none-any.whl.metadata (1.7 kB)
2026-07-28T19:39:13.5465506Z Downloading boto3-1.34.0-py3-none-any.whl (139 kB)
2026-07-28T19:39:13.5740399Z Downloading pydantic-2.5.0-py3-none-any.whl (407 kB)
2026-07-28T19:39:13.7824709Z Downloading pydantic_settings-2.1.0-py3-none-any.whl (11 kB)
2026-07-28T19:39:13.8006730Z Downloading pydantic_core-2.14.1-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (2.1 MB)
2026-07-28T19:39:14.0037736Z    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 2.1/2.1 MB 9.9 MB/s  0:00:00
2026-07-28T19:39:14.0147336Z Downloading botocore-1.34.162-py3-none-any.whl (12.5 MB)
2026-07-28T19:39:14.4009359Z    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 12.5/12.5 MB 34.9 MB/s  0:00:00
2026-07-28T19:39:14.4126129Z Downloading jmespath-1.1.0-py3-none-any.whl (20 kB)
2026-07-28T19:39:14.4624800Z Downloading python_dateutil-2.9.0.post0-py2.py3-none-any.whl (229 kB)
2026-07-28T19:39:14.5074216Z Downloading s3transfer-0.9.0-py3-none-any.whl (82 kB)
2026-07-28T19:39:14.5294460Z Downloading urllib3-2.7.0-py3-none-any.whl (131 kB)
2026-07-28T19:39:14.6711580Z Downloading annotated_types-0.8.0-py3-none-any.whl (13 kB)
2026-07-28T19:39:14.6839464Z Downloading python_dotenv-1.2.2-py3-none-any.whl (22 kB)
2026-07-28T19:39:14.7584545Z Downloading six-1.17.0-py2.py3-none-any.whl (11 kB)
2026-07-28T19:39:14.7711520Z Downloading typing_extensions-4.16.0-py3-none-any.whl (45 kB)
2026-07-28T19:39:14.9735049Z Installing collected packages: urllib3, typing-extensions, six, python-dotenv, jmespath, annotated-types, python-dateutil, pydantic-core, pydantic, botocore, s3transfer, pydantic-settings, boto3
2026-07-28T19:39:15.9163641Z 
2026-07-28T19:39:15.9175079Z Successfully installed annotated-types-0.8.0 boto3-1.34.0 botocore-1.34.162 jmespath-1.1.0 pydantic-2.5.0 pydantic-core-2.14.1 pydantic-settings-2.1.0 python-dateutil-2.9.0.post0 python-dotenv-1.2.2 s3transfer-0.9.0 six-1.17.0 typing-extensions-4.16.0 urllib3-2.7.0
2026-07-28T19:39:16.3366656Z Collecting requests==2.31.0 (from -r requirements.txt (line 1))
2026-07-28T19:39:16.4037054Z   Downloading requests-2.31.0-py3-none-any.whl.metadata (4.6 kB)
2026-07-28T19:39:16.6376091Z Collecting sqlalchemy==2.0.23 (from -r requirements.txt (line 2))
2026-07-28T19:39:16.6506532Z   Downloading SQLAlchemy-2.0.23-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (9.6 kB)
2026-07-28T19:39:16.7036519Z Collecting psycopg2-binary==2.9.9 (from -r requirements.txt (line 3))
2026-07-28T19:39:16.7153365Z   Downloading psycopg2_binary-2.9.9-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (4.4 kB)
2026-07-28T19:39:16.7396487Z Collecting python-dotenv==1.0.0 (from -r requirements.txt (line 4))
2026-07-28T19:39:16.7504330Z   Downloading python_dotenv-1.0.0-py3-none-any.whl.metadata (21 kB)
2026-07-28T19:39:16.7760284Z Collecting geoalchemy2==0.14.2 (from -r requirements.txt (line 5))
2026-07-28T19:39:16.7875592Z   Downloading GeoAlchemy2-0.14.2-py3-none-any.whl.metadata (1.9 kB)
2026-07-28T19:39:17.0149528Z Requirement already satisfied: pydantic==2.5.0 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from -r requirements.txt (line 6)) (2.5.0)
2026-07-28T19:39:17.0152170Z Requirement already satisfied: pydantic-settings==2.1.0 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from -r requirements.txt (line 7)) (2.1.0)
2026-07-28T19:39:17.0155053Z Requirement already satisfied: boto3==1.34.0 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from -r requirements.txt (line 8)) (1.34.0)
2026-07-28T19:39:17.0837976Z Collecting pytz==2023.3 (from -r requirements.txt (line 9))
2026-07-28T19:39:17.0946390Z   Downloading pytz-2023.3-py2.py3-none-any.whl.metadata (22 kB)
2026-07-28T19:39:17.1681800Z Collecting charset-normalizer<4,>=2 (from requests==2.31.0->-r requirements.txt (line 1))
2026-07-28T19:39:17.1789746Z   Downloading charset_normalizer-3.4.9-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (41 kB)
2026-07-28T19:39:17.3136930Z Collecting idna<4,>=2.5 (from requests==2.31.0->-r requirements.txt (line 1))
2026-07-28T19:39:17.3245225Z   Downloading idna-3.18-py3-none-any.whl.metadata (6.1 kB)
2026-07-28T19:39:17.3277618Z Requirement already satisfied: urllib3<3,>=1.21.1 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from requests==2.31.0->-r requirements.txt (line 1)) (2.7.0)
2026-07-28T19:39:17.3455018Z Collecting certifi>=2017.4.17 (from requests==2.31.0->-r requirements.txt (line 1))
2026-07-28T19:39:17.3564202Z   Downloading certifi-2026.7.22-py3-none-any.whl.metadata (2.5 kB)
2026-07-28T19:39:17.3602519Z Requirement already satisfied: typing-extensions>=4.2.0 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from sqlalchemy==2.0.23->-r requirements.txt (line 2)) (4.16.0)
2026-07-28T19:39:17.4635388Z Collecting greenlet!=0.4.17 (from sqlalchemy==2.0.23->-r requirements.txt (line 2))
2026-07-28T19:39:17.4743118Z   Downloading greenlet-3.5.4-cp311-cp311-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl.metadata (3.8 kB)
2026-07-28T19:39:17.5811296Z Collecting packaging (from geoalchemy2==0.14.2->-r requirements.txt (line 5))
2026-07-28T19:39:17.5919647Z   Downloading packaging-26.2-py3-none-any.whl.metadata (3.5 kB)
2026-07-28T19:39:17.5961255Z Requirement already satisfied: annotated-types>=0.4.0 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from pydantic==2.5.0->-r requirements.txt (line 6)) (0.8.0)
2026-07-28T19:39:17.5965065Z Requirement already satisfied: pydantic-core==2.14.1 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from pydantic==2.5.0->-r requirements.txt (line 6)) (2.14.1)
2026-07-28T19:39:17.5984584Z Requirement already satisfied: botocore<1.35.0,>=1.34.0 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from boto3==1.34.0->-r requirements.txt (line 8)) (1.34.162)
2026-07-28T19:39:17.5988171Z Requirement already satisfied: jmespath<2.0.0,>=0.7.1 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from boto3==1.34.0->-r requirements.txt (line 8)) (1.1.0)
2026-07-28T19:39:17.5991884Z Requirement already satisfied: s3transfer<0.10.0,>=0.9.0 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from boto3==1.34.0->-r requirements.txt (line 8)) (0.9.0)
2026-07-28T19:39:17.6007356Z Requirement already satisfied: python-dateutil<3.0.0,>=2.1 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from botocore<1.35.0,>=1.34.0->boto3==1.34.0->-r requirements.txt (line 8)) (2.9.0.post0)
2026-07-28T19:39:17.6030352Z Requirement already satisfied: six>=1.5 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from python-dateutil<3.0.0,>=2.1->botocore<1.35.0,>=1.34.0->boto3==1.34.0->-r requirements.txt (line 8)) (1.17.0)
2026-07-28T19:39:17.6172026Z Downloading requests-2.31.0-py3-none-any.whl (62 kB)
2026-07-28T19:39:17.6336134Z Downloading SQLAlchemy-2.0.23-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (3.2 MB)
2026-07-28T19:39:17.7715705Z    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3.2/3.2 MB 24.6 MB/s  0:00:00
2026-07-28T19:39:17.7822371Z Downloading psycopg2_binary-2.9.9-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (3.0 MB)
2026-07-28T19:39:18.0495073Z    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3.0/3.0 MB 10.4 MB/s  0:00:00
2026-07-28T19:39:18.0604035Z Downloading python_dotenv-1.0.0-py3-none-any.whl (19 kB)
2026-07-28T19:39:18.0848248Z Downloading GeoAlchemy2-0.14.2-py3-none-any.whl (72 kB)
2026-07-28T19:39:18.0972882Z Downloading pytz-2023.3-py2.py3-none-any.whl (502 kB)
2026-07-28T19:39:18.1133574Z Downloading charset_normalizer-3.4.9-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl (221 kB)
2026-07-28T19:39:18.1268024Z Downloading idna-3.18-py3-none-any.whl (65 kB)
2026-07-28T19:39:18.1395440Z Downloading certifi-2026.7.22-py3-none-any.whl (136 kB)
2026-07-28T19:39:18.1577683Z Downloading greenlet-3.5.4-cp311-cp311-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl (624 kB)
2026-07-28T19:39:18.1624690Z    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 624.7/624.7 kB 140.0 MB/s  0:00:00
2026-07-28T19:39:18.1734444Z Downloading packaging-26.2-py3-none-any.whl (100 kB)
2026-07-28T19:39:18.3550957Z Installing collected packages: pytz, python-dotenv, psycopg2-binary, packaging, idna, greenlet, charset-normalizer, certifi, sqlalchemy, requests, geoalchemy2
2026-07-28T19:39:18.4018015Z   Attempting uninstall: python-dotenv
2026-07-28T19:39:18.4034470Z     Found existing installation: python-dotenv 1.2.2
2026-07-28T19:39:18.4054464Z     Uninstalling python-dotenv-1.2.2:
2026-07-28T19:39:18.4061989Z       Successfully uninstalled python-dotenv-1.2.2
2026-07-28T19:39:19.4030165Z 
2026-07-28T19:39:19.4042184Z Successfully installed certifi-2026.7.22 charset-normalizer-3.4.9 geoalchemy2-0.14.2 greenlet-3.5.4 idna-3.18 packaging-26.2 psycopg2-binary-2.9.9 python-dotenv-1.0.0 pytz-2023.3 requests-2.31.0 sqlalchemy-2.0.23
2026-07-28T19:39:19.4711489Z ##[group]Run cd ingestion
2026-07-28T19:39:19.4711882Z [36;1mcd ingestion[0m
2026-07-28T19:39:19.4712264Z [36;1mpython run_ingestion.py --source all --period incremental[0m
2026-07-28T19:39:19.4737713Z shell: /usr/bin/bash -e {0}
2026-07-28T19:39:19.4738081Z env:
2026-07-28T19:39:19.4738403Z   pythonLocation: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T19:39:19.4738921Z   PKG_CONFIG_PATH: /opt/hostedtoolcache/Python/3.11.15/x64/lib/pkgconfig
2026-07-28T19:39:19.4739416Z   Python_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T19:39:19.4739871Z   Python2_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T19:39:19.4740614Z   Python3_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T19:39:19.4741039Z   LD_LIBRARY_PATH: /opt/hostedtoolcache/Python/3.11.15/x64/lib
2026-07-28T19:39:19.4741448Z   ENV: staging
2026-07-28T19:39:19.4741735Z   AWS_REGION: ap-southeast-2
2026-07-28T19:39:19.4742262Z   AWS_ACCESS_KEY_ID: ***
2026-07-28T19:39:19.4742773Z   AWS_SECRET_ACCESS_KEY: ***
2026-07-28T19:39:19.4743116Z   HARVEST_API_KEY: ***
2026-07-28T19:39:19.4743532Z   SECRET_KEY: ***

2026-07-28T19:39:19.4743901Z   VITE_API_URL: ***
2026-07-28T19:39:19.4744184Z   RDS_USER: ***
2026-07-28T19:39:19.4744531Z   RDS_PASSWORD: ***
2026-07-28T19:39:19.4744892Z   RDS_ENDPOINT: ***
2026-07-28T19:39:19.4745208Z   RDS_PORT: 5432
2026-07-28T19:39:19.4745499Z   RDS_DATABASE: auxein_db
2026-07-28T19:39:19.4745808Z ##[endgroup]
2026-07-28T19:39:20.4408464Z   RDS_SECRET_NAME not set, trying environment variables
2026-07-28T19:39:20.4409228Z   Using RDS database from environment variables (ENV=staging)
2026-07-28T19:54:57.1229423Z 
2026-07-28T19:54:57.1230315Z ======================================================================
2026-07-28T19:54:57.1231462Z   WEATHER DATA INGESTION
2026-07-28T19:54:57.1231930Z   Started: 2026-07-28 19:39:20.446091
2026-07-28T19:54:57.1232430Z   Source: ALL
2026-07-28T19:54:57.1232857Z   Period: INCREMENTAL
2026-07-28T19:54:57.1233307Z ======================================================================
2026-07-28T19:54:57.1233602Z 
2026-07-28T19:54:57.1234087Z ▶ Starting HARVEST ingestion...
2026-07-28T19:54:57.1234359Z 
2026-07-28T19:54:57.1234367Z 
2026-07-28T19:54:57.1234570Z ============================================================
2026-07-28T19:54:57.1235139Z Starting Harvest ingestion at 2026-07-28 19:39:20.446157
2026-07-28T19:54:57.1235707Z ============================================================
2026-07-28T19:54:57.1235943Z 
2026-07-28T19:54:57.1236107Z Found 43 active Harvest stations
2026-07-28T19:54:57.1236835Z 
2026-07-28T19:54:57.1237153Z Resolved 2/2 credential ref(s) across 43 stations
2026-07-28T19:54:57.1237412Z 
2026-07-28T19:54:57.1237571Z Processing: HARV_BARBOUR_01_HUMIDITY
2026-07-28T19:54:57.1237980Z     Fetching trace 359406: 2026-07-27 to 2026-07-28
2026-07-28T19:54:57.1238380Z       Page 1: 200 records (fetching more...)
2026-07-28T19:54:57.1238747Z       Page 2: 200 records (fetching more...)
2026-07-28T19:54:57.1239179Z       Page 3: 200 records (fetching more...)
2026-07-28T19:54:57.1239596Z       Page 4: 200 records (fetching more...)
2026-07-28T19:54:57.1240308Z       Page 5: 199 records (fetching more...)
2026-07-28T19:54:57.1240744Z       Page 6: 200 records (fetching more...)
2026-07-28T19:54:57.1241483Z       Page 7: 200 records (fetching more...)
2026-07-28T19:54:57.1241904Z       Page 8: 200 records (fetching more...)
2026-07-28T19:54:57.1242567Z     Received 1632 total records across 9 page(s)
2026-07-28T19:54:57.1243273Z   ✓ Inserted 1632 records
2026-07-28T19:54:57.1243629Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T19:54:57.1243844Z 
2026-07-28T19:54:57.1244034Z Processing: HARV_BARBOUR_01_PRECIP
2026-07-28T19:54:57.1244475Z     Fetching trace 321175: 2026-07-27 to 2026-07-28
2026-07-28T19:54:57.1244887Z       Page 1: 200 records (fetching more...)
2026-07-28T19:54:57.1245220Z       Page 2: 200 records (fetching more...)
2026-07-28T19:54:57.1245885Z       Page 3: 200 records (fetching more...)
2026-07-28T19:54:57.1246256Z       Page 4: 200 records (fetching more...)
2026-07-28T19:54:57.1246631Z       Page 5: 200 records (fetching more...)
2026-07-28T19:54:57.1247018Z       Page 6: 200 records (fetching more...)
2026-07-28T19:54:57.1247379Z       Page 7: 200 records (fetching more...)
2026-07-28T19:54:57.1247775Z       Page 8: 200 records (fetching more...)
2026-07-28T19:54:57.1248140Z     Received 1633 total records across 9 page(s)
2026-07-28T19:54:57.1248571Z   ✓ Inserted 1633 records
2026-07-28T19:54:57.1248876Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T19:54:57.1249124Z 
2026-07-28T19:54:57.1249309Z Processing: HARV_BARBOUR_01_RADIATION
2026-07-28T19:54:57.1249686Z     Fetching trace 359409: 2026-07-27 to 2026-07-28
2026-07-28T19:54:57.1250273Z       Page 1: 200 records (fetching more...)
2026-07-28T19:54:57.1250666Z       Page 2: 200 records (fetching more...)
2026-07-28T19:54:57.1251050Z       Page 3: 200 records (fetching more...)
2026-07-28T19:54:57.1251434Z       Page 4: 200 records (fetching more...)
2026-07-28T19:54:57.1251775Z       Page 5: 200 records (fetching more...)
2026-07-28T19:54:57.1252165Z       Page 6: 200 records (fetching more...)
2026-07-28T19:54:57.1252493Z       Page 7: 200 records (fetching more...)
2026-07-28T19:54:57.1252925Z       Page 8: 200 records (fetching more...)
2026-07-28T19:54:57.1253300Z     Received 1633 total records across 9 page(s)
2026-07-28T19:54:57.1253717Z   ✓ Inserted 1633 records
2026-07-28T19:54:57.1254059Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T19:54:57.1254226Z 
2026-07-28T19:54:57.1254447Z Processing: HARV_BARBOUR_01_TEMP
2026-07-28T19:54:57.1254911Z   ✓ Already up to date (last: 2026-07-28 07:50:00+00:00)
2026-07-28T19:54:57.1255150Z 
2026-07-28T19:54:57.1255294Z Processing: HARV_BARBOUR_02_TEMP
2026-07-28T19:54:57.1255687Z     Fetching trace 359404: 2026-07-28 to 2026-07-28
2026-07-28T19:54:57.1256103Z       Page 1: 200 records (fetching more...)
2026-07-28T19:54:57.1256460Z       Page 2: 200 records (fetching more...)
2026-07-28T19:54:57.1256825Z       Page 3: 200 records (fetching more...)
2026-07-28T19:54:57.1257189Z       Page 4: 200 records (fetching more...)
2026-07-28T19:54:57.1257584Z     Received 818 total records across 5 page(s)
2026-07-28T19:54:57.1258002Z   ✓ Inserted 818 records
2026-07-28T19:54:57.1258342Z   Time range: 2026-07-28 to 2026-07-28
2026-07-28T19:54:57.1258540Z 
2026-07-28T19:54:57.1258680Z Processing: HARV_BARBOUR_03_TEMP
2026-07-28T19:54:57.1259125Z   ✓ Already up to date (last: 2026-07-28 07:51:00+00:00)
2026-07-28T19:54:57.1259373Z 
2026-07-28T19:54:57.1259652Z Processing: HARV_BLACK_01_TEMP
2026-07-28T19:54:57.1260264Z   ✓ Already up to date (last: 2026-07-28 07:50:00+00:00)
2026-07-28T19:54:57.1260626Z 
2026-07-28T19:54:57.1260769Z Processing: HARV_BLACK_02_TEMP
2026-07-28T19:54:57.1261169Z     Fetching trace 16116: 2026-04-25 to 2026-07-28
2026-07-28T19:54:57.1261559Z       Page 1: 1 records (fetching more...)
2026-07-28T19:54:57.1261956Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1262315Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1262706Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1263042Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1263429Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1263772Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1264127Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1264515Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1264869Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1265251Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1265585Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1266184Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1266614Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1267110Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1267547Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1268173Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1268710Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1269159Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1269543Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1269880Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1270684Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1271021Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1271398Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1271744Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1272111Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1272522Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1272855Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1273236Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1273573Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1273985Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1274319Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1274684Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1275030Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1275390Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1275805Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1276143Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1276530Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1276868Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1277274Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1277604Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1277975Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1278337Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1278704Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1279091Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1279426Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1279808Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1280305Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1280700Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1281025Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1281389Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1281731Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1282100Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1282584Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1282910Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1283278Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1283632Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1283997Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1284321Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1284688Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1285026Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1285390Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1285767Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1286092Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1286459Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1286806Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1287171Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1287503Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1287866Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1288221Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1288563Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1288946Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1289273Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1289736Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1290235Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1290614Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1290943Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1291312Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1291739Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1292245Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1292660Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1293095Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1293652Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1294015Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1294412Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1294761Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1295143Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1295540Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1295868Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1296248Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1296582Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1297006Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1297341Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1297710Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1298052Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1298433Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1298823Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1299161Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1299545Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1300019Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1300570Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1300916Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1301292Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1301639Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1302019Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1302407Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1302745Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1303122Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1303478Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1303851Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1304475Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1304939Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1305406Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1305839Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1306433Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1306783Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1307182Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1307509Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1307881Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1308585Z       Page 1: 0 records (fetching more...)
2026-07-28T19:54:57.1308968Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4456534Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4457229Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4457697Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4458363Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4458860Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4459298Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4459775Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4460577Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4461073Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4462148Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4462507Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4462861Z     Received 1 total records across 1 page(s)
2026-07-28T20:01:59.4463465Z   ✓ Inserted 1 records
2026-07-28T20:01:59.4463833Z   Time range: 2026-04-25 to 2026-04-25
2026-07-28T20:01:59.4464032Z 
2026-07-28T20:01:59.4464190Z Processing: HARV_BLACK_03_TEMP
2026-07-28T20:01:59.4464631Z   ✓ Already up to date (last: 2026-07-28 07:50:00+00:00)
2026-07-28T20:01:59.4464903Z 
2026-07-28T20:01:59.4465031Z Processing: HARV_BLACK_05_TEMP
2026-07-28T20:01:59.4465476Z   ✓ Already up to date (last: 2026-07-28 07:50:00+00:00)
2026-07-28T20:01:59.4465707Z 
2026-07-28T20:01:59.4465841Z Processing: HARV_BLACK_06_PRECIP
2026-07-28T20:01:59.4466207Z     Fetching trace 16121: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4466608Z       Page 1: 200 records (fetching more...)
2026-07-28T20:01:59.4467046Z     Received 309 total records across 2 page(s)
2026-07-28T20:01:59.4467633Z   ✓ Inserted 309 records
2026-07-28T20:01:59.4467985Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4468194Z 
2026-07-28T20:01:59.4468338Z Processing: HARV_CODC_ALEX_HUMIDITY
2026-07-28T20:01:59.4468800Z     Fetching trace 60325: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4469397Z       Page 1: 200 records (fetching more...)
2026-07-28T20:01:59.4469841Z     Received 210 total records across 2 page(s)
2026-07-28T20:01:59.4470560Z   ✓ Inserted 210 records
2026-07-28T20:01:59.4470965Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4471141Z 
2026-07-28T20:01:59.4471329Z Processing: HARV_CODC_ALEX_PRECIP
2026-07-28T20:01:59.4471695Z     Fetching trace 60326: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4472054Z       Page 1: 200 records (fetching more...)
2026-07-28T20:01:59.4472421Z     Received 210 total records across 2 page(s)
2026-07-28T20:01:59.4472809Z   ✓ Inserted 210 records
2026-07-28T20:01:59.4473154Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4473354Z 
2026-07-28T20:01:59.4473526Z Processing: HARV_CODC_ALEX_RADIATION
2026-07-28T20:01:59.4473868Z     Fetching trace 60330: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4474253Z       Page 1: 200 records (fetching more...)
2026-07-28T20:01:59.4474612Z     Received 210 total records across 2 page(s)
2026-07-28T20:01:59.4474995Z   ✓ Inserted 210 records
2026-07-28T20:01:59.4475306Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4475507Z 
2026-07-28T20:01:59.4475642Z Processing: HARV_CODC_ALEX_TEMP
2026-07-28T20:01:59.4476010Z     Fetching trace 60324: 2026-07-28 to 2026-07-28
2026-07-28T20:01:59.4476552Z     Received 101 total records across 1 page(s)
2026-07-28T20:01:59.4476952Z   ✓ Inserted 101 records
2026-07-28T20:01:59.4477243Z   Time range: 2026-07-28 to 2026-07-28
2026-07-28T20:01:59.4477428Z 
2026-07-28T20:01:59.4477642Z Processing: HARV_CODC_CROM_HUMIDITY
2026-07-28T20:01:59.4477972Z     Fetching trace 60296: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4478360Z       Page 1: 200 records (fetching more...)
2026-07-28T20:01:59.4478715Z     Received 210 total records across 2 page(s)
2026-07-28T20:01:59.4479083Z   ✓ Inserted 210 records
2026-07-28T20:01:59.4479421Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4479618Z 
2026-07-28T20:01:59.4479770Z Processing: HARV_CODC_CROM_PRECIP
2026-07-28T20:01:59.4480416Z     Fetching trace 60297: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4480767Z       Page 1: 200 records (fetching more...)
2026-07-28T20:01:59.4481170Z     Received 210 total records across 2 page(s)
2026-07-28T20:01:59.4481531Z   ✓ Inserted 210 records
2026-07-28T20:01:59.4481859Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4482068Z 
2026-07-28T20:01:59.4482188Z Processing: HARV_CODC_CROM_RADIATION
2026-07-28T20:01:59.4482556Z     Fetching trace 60301: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4482964Z       Page 1: 200 records (fetching more...)
2026-07-28T20:01:59.4483302Z     Received 210 total records across 2 page(s)
2026-07-28T20:01:59.4483777Z   ✓ Inserted 210 records
2026-07-28T20:01:59.4484085Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4484269Z 
2026-07-28T20:01:59.4484442Z Processing: HARV_CODC_CROM_TEMP
2026-07-28T20:01:59.4484832Z   ✓ Already up to date (last: 2026-07-28 07:50:00+00:00)
2026-07-28T20:01:59.4485070Z 
2026-07-28T20:01:59.4485218Z Processing: HARV_CODC_ROXB_HUMIDITY
2026-07-28T20:01:59.4485589Z     Fetching trace 60197: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4485935Z       Page 1: 200 records (fetching more...)
2026-07-28T20:01:59.4486330Z     Received 210 total records across 2 page(s)
2026-07-28T20:01:59.4486683Z   ✓ Inserted 210 records
2026-07-28T20:01:59.4487010Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4487228Z 
2026-07-28T20:01:59.4487352Z Processing: HARV_CODC_ROXB_PRECIP
2026-07-28T20:01:59.4487852Z     Fetching trace 60198: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4488195Z       Page 1: 200 records (fetching more...)
2026-07-28T20:01:59.4488582Z     Received 210 total records across 2 page(s)
2026-07-28T20:01:59.4488993Z   ✓ Inserted 210 records
2026-07-28T20:01:59.4489270Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4489495Z 
2026-07-28T20:01:59.4489643Z Processing: HARV_CODC_ROXB_RADIATION
2026-07-28T20:01:59.4490119Z     Fetching trace 60202: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4490581Z       Page 1: 200 records (fetching more...)
2026-07-28T20:01:59.4490947Z     Received 210 total records across 2 page(s)
2026-07-28T20:01:59.4491353Z   ✓ Inserted 210 records
2026-07-28T20:01:59.4491640Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:01:59.4491846Z 
2026-07-28T20:01:59.4491994Z Processing: HARV_CODC_ROXB_TEMP
2026-07-28T20:01:59.4492426Z   ✓ Already up to date (last: 2026-07-28 07:50:00+00:00)
2026-07-28T20:01:59.4492627Z 
2026-07-28T20:01:59.4492769Z Processing: HARV_GREYSTONE_01_TEMP
2026-07-28T20:01:59.4493200Z   ✓ Already up to date (last: 2026-07-28 07:49:00+00:00)
2026-07-28T20:01:59.4493430Z 
2026-07-28T20:01:59.4493557Z Processing: HARV_GREYSTONE_02_TEMP
2026-07-28T20:01:59.4493993Z   ✓ Already up to date (last: 2026-07-28 08:00:00+00:00)
2026-07-28T20:01:59.4494219Z 
2026-07-28T20:01:59.4494368Z Processing: HARV_GREYSTONE_03_TEMP
2026-07-28T20:01:59.4494755Z   ✓ Already up to date (last: 2026-07-28 08:00:00+00:00)
2026-07-28T20:01:59.4494975Z 
2026-07-28T20:01:59.4495124Z Processing: HARV_GREYSTONE_04_TEMP
2026-07-28T20:01:59.4495495Z   ✓ Already up to date (last: 2026-07-28 08:01:00+00:00)
2026-07-28T20:01:59.4495754Z 
2026-07-28T20:01:59.4495901Z Processing: HARV_GREYSTONE_05_TEMP
2026-07-28T20:01:59.4496261Z   ✓ Already up to date (last: 2026-07-28 08:02:00+00:00)
2026-07-28T20:01:59.4496616Z 
2026-07-28T20:01:59.4496766Z Processing: HARV_GREYSTONE_06_TEMP
2026-07-28T20:01:59.4497112Z     Fetching trace 263565: 2026-02-03 to 2026-07-28
2026-07-28T20:01:59.4497509Z       Page 1: 1 records (fetching more...)
2026-07-28T20:01:59.4497875Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4498213Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4498569Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4498910Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4499269Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4499578Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4500218Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4500594Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4500943Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4501298Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4501643Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4501994Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4502332Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4502698Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4503004Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4503376Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4503809Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4504150Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4504499Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4504830Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4505199Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4505519Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4505883Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4506191Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4506566Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4506928Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4507266Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4507612Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4507943Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4508347Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4508714Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4509028Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4509372Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4509747Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4510206Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4510584Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4510902Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4511286Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4511607Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4511976Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4512295Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4512638Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4513017Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4513318Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4513690Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4514011Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4514410Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4514730Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4515103Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4515419Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4515763Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4516139Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4516445Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4516892Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4517211Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4517597Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4517912Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4518276Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4518600Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4518965Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4519325Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4519632Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4520078Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4520431Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4520789Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4521112Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4521479Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4521806Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4522187Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4522541Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4522847Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4523222Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4523600Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4524043Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4524367Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4524740Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4525087Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4525439Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4525801Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4526104Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4526498Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4526829Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4527186Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4527506Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4527881Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4528220Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4528574Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4528944Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4529249Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4529638Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4530057Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4530602Z       Page 1: 0 records (fetching more...)
2026-07-28T20:01:59.4530923Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7431913Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7432560Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7433199Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7433713Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7434519Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7434976Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7435438Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7435909Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7436440Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7436897Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7437422Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7437912Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7438385Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7438905Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7439378Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7440017Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7440474Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7441390Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7441724Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7442109Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7442561Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7443036Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7443419Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7443867Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7444475Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7444901Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7445462Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7445877Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7446320Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7446746Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7447323Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7447726Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7448260Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7448701Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7449062Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7449559Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7450054Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7450630Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7451232Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7451650Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7452058Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7452529Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7452938Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7453488Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7453941Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7454398Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7454960Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7455377Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7455942Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7456502Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7456873Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7457467Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7457872Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7458308Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7458792Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7459203Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7459703Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7460266Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7460653Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7461215Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7461819Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7462174Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7462678Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7463036Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7463610Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7464154Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7464521Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7464970Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7465337Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7465876Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7466259Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7466826Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7467325Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7467783Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7468436Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7468925Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7469351Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7469841Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7470401Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7470789Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7471231Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7471666Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7472092Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7472562Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7472938Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7473386Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7473769Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7474345Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7474754Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7475178Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7475629Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7476054Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7476501Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7476982Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7477420Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7477847Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7478402Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7478925Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7479389Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7479782Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7480396Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7480825Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7481222Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7481815Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7482186Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7482758Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7483137Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7483643Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7484029Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7484504Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7484906Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7485269Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7485835Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7486213Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7486608Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7486945Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7487389Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7487821Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7488230Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7488620Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7488986Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7489391Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7489750Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7490349Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7490700Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7491142Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7491563Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7491975Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7492361Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7492725Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7493232Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7493583Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7493976Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7494316Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7494751Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7495107Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7495590Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7495975Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7496360Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7496736Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7497089Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7497484Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7497820Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7498257Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7498951Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7499362Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7499750Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7500341Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7500735Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7501092Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7501575Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7501938Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7502358Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7502715Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7503112Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7503535Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7503907Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7504292Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7504648Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7505067Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7505408Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7505819Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7506450Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7506857Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7507265Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7507631Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7508020Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7508377Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7508800Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7509137Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7509549Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7509976Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7510406Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7510803Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7511173Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7511551Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7511988Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7512541Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7512880Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7513293Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7513643Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7514065Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7514448Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7514812Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7515195Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7515547Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7515962Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7516383Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7516807Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7517159Z       Page 1: 0 records (fetching more...)
2026-07-28T20:03:05.7517577Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8357455Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8359763Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8360495Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8360896Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8361266Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8361609Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8361961Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8362307Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8362562Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8362834Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8363101Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8363380Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8363624Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8363879Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8364123Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8364379Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8364992Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8365253Z       Page 1: 0 records (fetching more...)
2026-07-28T20:31:29.8365531Z     Received 1 total records across 1 page(s)
2026-07-28T20:31:29.8366030Z   ✓ Inserted 1 records
2026-07-28T20:31:29.8366271Z   Time range: 2026-02-03 to 2026-02-03
2026-07-28T20:31:29.8366432Z 
2026-07-28T20:31:29.8366549Z Processing: HARV_GREYSTONE_07_HUMIDITY
2026-07-28T20:31:29.8366831Z     Fetching trace 18535: 2026-07-27 to 2026-07-28
2026-07-28T20:31:29.8367108Z       Page 1: 199 records (fetching more...)
2026-07-28T20:31:29.8367414Z       Page 2: 200 records (fetching more...)
2026-07-28T20:31:29.8367760Z       Page 3: 200 records (fetching more...)
2026-07-28T20:31:29.8368031Z       Page 4: 200 records (fetching more...)
2026-07-28T20:31:29.8368287Z       Page 5: 200 records (fetching more...)
2026-07-28T20:31:29.8368629Z       Page 6: 200 records (fetching more...)
2026-07-28T20:31:29.8368891Z       Page 7: 200 records (fetching more...)
2026-07-28T20:31:29.8369269Z     Received 1585 total records across 8 page(s)
2026-07-28T20:31:29.8369620Z   ✓ Inserted 1585 records
2026-07-28T20:31:29.8369851Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:31:29.8370170Z 
2026-07-28T20:31:29.8370314Z Processing: HARV_GREYSTONE_07_PRECIP
2026-07-28T20:31:29.8370626Z     Fetching trace 266450: 2026-07-27 to 2026-07-28
2026-07-28T20:31:29.8370990Z       Page 1: 200 records (fetching more...)
2026-07-28T20:31:29.8371251Z       Page 2: 200 records (fetching more...)
2026-07-28T20:31:29.8371512Z       Page 3: 200 records (fetching more...)
2026-07-28T20:31:29.8371854Z       Page 4: 200 records (fetching more...)
2026-07-28T20:31:29.8372107Z       Page 5: 200 records (fetching more...)
2026-07-28T20:31:29.8372412Z       Page 6: 200 records (fetching more...)
2026-07-28T20:31:29.8372800Z       Page 7: 200 records (fetching more...)
2026-07-28T20:31:29.8373099Z     Received 1582 total records across 8 page(s)
2026-07-28T20:31:29.8373548Z   ✓ Inserted 1582 records
2026-07-28T20:31:29.8373790Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:31:29.8374115Z 
2026-07-28T20:31:29.8374221Z Processing: HARV_GREYSTONE_07_RADIATION
2026-07-28T20:31:29.8374498Z     Fetching trace 263560: 2026-07-27 to 2026-07-28
2026-07-28T20:31:29.8374867Z       Page 1: 200 records (fetching more...)
2026-07-28T20:31:29.8375132Z       Page 2: 200 records (fetching more...)
2026-07-28T20:31:29.8375417Z       Page 3: 200 records (fetching more...)
2026-07-28T20:31:29.8375815Z       Page 4: 200 records (fetching more...)
2026-07-28T20:31:29.8376073Z       Page 5: 200 records (fetching more...)
2026-07-28T20:31:29.8376671Z       Page 6: 200 records (fetching more...)
2026-07-28T20:31:29.8376960Z       Page 7: 200 records (fetching more...)
2026-07-28T20:31:29.8377301Z     Received 1579 total records across 8 page(s)
2026-07-28T20:31:29.8377602Z   ✓ Inserted 1579 records
2026-07-28T20:31:29.8377883Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:31:29.8378041Z 
2026-07-28T20:31:29.8378160Z Processing: HARV_MAORI_PT_01_HUMIDITY
2026-07-28T20:31:29.8378423Z     Fetching trace 34354: 2026-07-27 to 2026-07-28
2026-07-28T20:31:29.8378781Z       Page 1: 200 records (fetching more...)
2026-07-28T20:31:29.8379060Z     Received 392 total records across 2 page(s)
2026-07-28T20:31:29.8379512Z   ✓ Inserted 392 records
2026-07-28T20:31:29.8379748Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:31:29.8380215Z 
2026-07-28T20:31:29.8380336Z Processing: HARV_MAORI_PT_01_PRESSURE
2026-07-28T20:31:29.8380611Z     Fetching trace 316388: 2026-07-27 to 2026-07-28
2026-07-28T20:31:29.8380998Z       Page 1: 200 records (fetching more...)
2026-07-28T20:31:29.8381289Z     Received 392 total records across 2 page(s)
2026-07-28T20:31:29.8381642Z   ✓ Inserted 392 records
2026-07-28T20:31:29.8381884Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:31:29.8382034Z 
2026-07-28T20:31:29.8382133Z Processing: HARV_MAORI_PT_01_TEMP
2026-07-28T20:31:29.8382675Z   ✓ Already up to date (last: 2026-07-28 08:10:00+00:00)
2026-07-28T20:31:29.8382871Z 
2026-07-28T20:31:29.8383091Z Processing: HARV_MAORI_PT_02_TEMP
2026-07-28T20:31:29.8383482Z   ✓ Already up to date (last: 2026-07-28 08:10:00+00:00)
2026-07-28T20:31:29.8383670Z 
2026-07-28T20:31:29.8383784Z Processing: HARV_NETHERWOOD_01_HUMIDITY
2026-07-28T20:31:29.8384221Z     Fetching trace 18687: 2026-07-27 to 2026-07-28
2026-07-28T20:31:29.8384506Z       Page 1: 200 records (fetching more...)
2026-07-28T20:31:29.8384839Z       Page 2: 200 records (fetching more...)
2026-07-28T20:31:29.8385108Z       Page 3: 200 records (fetching more...)
2026-07-28T20:31:29.8385395Z       Page 4: 200 records (fetching more...)
2026-07-28T20:31:29.8385737Z       Page 5: 200 records (fetching more...)
2026-07-28T20:31:29.8385989Z       Page 6: 200 records (fetching more...)
2026-07-28T20:31:29.8386408Z       Page 7: 200 records (fetching more...)
2026-07-28T20:31:29.8386670Z       Page 8: 200 records (fetching more...)
2026-07-28T20:31:29.8386972Z     Received 1624 total records across 9 page(s)
2026-07-28T20:31:29.8387358Z   ✓ Inserted 1624 records
2026-07-28T20:31:29.8387585Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:31:29.8387904Z 
2026-07-28T20:31:29.8388020Z Processing: HARV_NETHERWOOD_01_PRECIP
2026-07-28T20:31:29.8388285Z     Fetching trace 18685: 2026-07-27 to 2026-07-28
2026-07-28T20:31:29.8388616Z       Page 1: 200 records (fetching more...)
2026-07-28T20:31:29.8388873Z       Page 2: 200 records (fetching more...)
2026-07-28T20:31:29.8389130Z       Page 3: 200 records (fetching more...)
2026-07-28T20:31:29.8389577Z       Page 4: 200 records (fetching more...)
2026-07-28T20:31:29.8389839Z       Page 5: 200 records (fetching more...)
2026-07-28T20:31:29.8390343Z       Page 6: 200 records (fetching more...)
2026-07-28T20:31:29.8390599Z       Page 7: 200 records (fetching more...)
2026-07-28T20:31:29.8391019Z       Page 8: 200 records (fetching more...)
2026-07-28T20:31:29.8391288Z     Received 1624 total records across 9 page(s)
2026-07-28T20:31:29.8391734Z   ✓ Inserted 1624 records
2026-07-28T20:31:29.8391981Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T20:31:29.8392127Z 
2026-07-28T20:31:29.8392260Z Processing: HARV_NETHERWOOD_01_TEMP
2026-07-28T20:31:29.8392644Z     Fetching trace 18678: 2026-07-28 to 2026-07-28
2026-07-28T20:31:29.8392911Z       Page 1: 200 records (fetching more...)
2026-07-28T20:31:29.8393331Z       Page 2: 200 records (fetching more...)
2026-07-28T20:31:29.8393588Z       Page 3: 200 records (fetching more...)
2026-07-28T20:31:29.8393894Z       Page 4: 200 records (fetching more...)
2026-07-28T20:31:29.8394294Z     Received 827 total records across 5 page(s)
2026-07-28T20:31:29.8394805Z   ✓ Inserted 827 records
2026-07-28T20:31:29.8395026Z   Time range: 2026-07-28 to 2026-07-28
2026-07-28T20:31:29.8395178Z 
2026-07-28T20:31:29.8395283Z Processing: HARV_NETHERWOOD_02_TEMP
2026-07-28T20:31:29.8395705Z   ✓ Already up to date (last: 2026-07-28 08:21:00+00:00)
2026-07-28T20:31:29.8395888Z 
2026-07-28T20:31:29.8395996Z Processing: HARV_NETHERWOOD_03_TEMP
2026-07-28T20:31:29.8396497Z   ✓ Already up to date (last: 2026-07-28 08:22:00+00:00)
2026-07-28T20:31:29.8396686Z 
2026-07-28T20:31:29.8396781Z Processing: HARV_NETHERWOOD_04_TEMP
2026-07-28T20:31:29.8397276Z   ✓ Already up to date (last: 2026-07-28 08:22:00+00:00)
2026-07-28T20:31:29.8397459Z 
2026-07-28T20:31:29.8397556Z Processing: HARV_NETHERWOOD_05_TEMP
2026-07-28T20:31:29.8397987Z     Fetching trace 18682: 2026-07-28 to 2026-07-28
2026-07-28T20:31:29.8398267Z       Page 1: 200 records (fetching more...)
2026-07-28T20:31:29.8398581Z       Page 2: 200 records (fetching more...)
2026-07-28T20:31:29.8398855Z       Page 3: 200 records (fetching more...)
2026-07-28T20:31:29.8399109Z       Page 4: 200 records (fetching more...)
2026-07-28T20:31:29.8399443Z     Received 830 total records across 5 page(s)
2026-07-28T20:31:29.8399730Z   ✓ Inserted 830 records
2026-07-28T20:31:29.8400198Z   Time range: 2026-07-28 to 2026-07-28
2026-07-28T20:31:29.8400359Z 
2026-07-28T20:31:29.8400467Z ============================================================
2026-07-28T20:31:29.8401047Z Harvest ingestion complete at 2026-07-28 20:30:19.648899
2026-07-28T20:31:29.8401350Z ============================================================
2026-07-28T20:31:29.8401568Z 
2026-07-28T20:31:29.8401764Z ✓ Harvest ingestion complete
2026-07-28T20:31:29.8401912Z 
2026-07-28T20:31:29.8402172Z   (note: credential session close raised: (psycopg2.OperationalError) SSL SYSCALL error: EOF detected
2026-07-28T20:31:29.8402571Z 
2026-07-28T20:31:29.8402785Z (Background on this error at: https://sqlalche.me/e/20/e3q8))
2026-07-28T20:31:29.8403000Z 
2026-07-28T20:31:29.8403326Z ▶ Starting ECAN ingestion...
2026-07-28T20:31:29.8403476Z 
2026-07-28T20:31:29.8403480Z 
2026-07-28T20:31:29.8403588Z ============================================================
2026-07-28T20:31:29.8403927Z Starting ECAN ingestion at 2026-07-28 20:30:19.655343
2026-07-28T20:31:29.8404271Z Period: 2_Days
2026-07-28T20:31:29.8404487Z ============================================================
2026-07-28T20:31:29.8404743Z 
2026-07-28T20:31:29.8404854Z Found 4 active ECAN sites
2026-07-28T20:31:29.8404993Z 
2026-07-28T20:31:29.8405096Z Processing: ECAN_HURUNUI_SH1
2026-07-28T20:31:29.8405409Z   ✓ rainfall: Inserted 48 records
2026-07-28T20:31:29.8405678Z   Total: 48/48 records
2026-07-28T20:31:29.8405800Z 
2026-07-28T20:31:29.8405900Z Processing: ECAN_LOWRY_HILLS
2026-07-28T20:31:29.8406208Z   ✓ rainfall: Inserted 48 records
2026-07-28T20:31:29.8406483Z   Total: 48/48 records
2026-07-28T20:31:29.8406608Z 
2026-07-28T20:31:29.8406711Z Processing: ECAN_PANNETS_ROAD
2026-07-28T20:31:29.8406985Z   ✓ rainfall: Inserted 47 records
2026-07-28T20:31:29.8407376Z   Total: 47/47 records
2026-07-28T20:31:29.8407502Z 
2026-07-28T20:31:29.8407594Z Processing: ECAN_WHITE_GORGE
2026-07-28T20:31:29.8407862Z   ✓ rainfall: Inserted 48 records
2026-07-28T20:31:29.8408090Z   Total: 48/48 records
2026-07-28T20:31:29.8408208Z 
2026-07-28T20:31:29.8408314Z ============================================================
2026-07-28T20:31:29.8408678Z ECAN ingestion complete at 2026-07-28 20:30:58.600142
2026-07-28T20:31:29.8408965Z ============================================================
2026-07-28T20:31:29.8409135Z 
2026-07-28T20:31:29.8409266Z ✓ ECAN ingestion complete
2026-07-28T20:31:29.8409407Z 
2026-07-28T20:31:29.8409525Z ▶ Starting MDC ingestion...
2026-07-28T20:31:29.8409667Z 
2026-07-28T20:31:29.8409670Z 
2026-07-28T20:31:29.8409777Z ============================================================
2026-07-28T20:31:29.8410175Z Starting MDC ingestion at 2026-07-28 20:30:58.600214
2026-07-28T20:31:29.8410448Z Period: incremental
2026-07-28T20:31:29.8410914Z Interval: 30 minutes
2026-07-28T20:31:29.8411142Z ============================================================
2026-07-28T20:31:29.8411310Z 
2026-07-28T20:31:29.8411413Z Found 52 active MDC station(s)
2026-07-28T20:31:29.8411555Z 
2026-07-28T20:31:29.8411654Z Processing: MDC_AWATERE_AT_AWAPIRI
2026-07-28T20:31:29.8411909Z   Site: Awatere at Awapiri
2026-07-28T20:31:29.8412234Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Direction']
2026-07-28T20:31:29.8412590Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T20:31:29.8413277Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20at%20Awapiri&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:31:29.8413936Z       ✓ 2026: inserted 49 records
2026-07-28T20:31:29.8414180Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T20:31:29.8414850Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20at%20Awapiri&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:31:29.8415487Z       ✓ 2026: inserted 49 records
2026-07-28T20:31:29.8415727Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T20:31:29.8416376Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20at%20Awapiri&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:31:29.8416993Z       ✓ 2026: inserted 49 records
2026-07-28T20:31:29.8417237Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T20:31:29.8417843Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20at%20Awapiri&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:31:29.8418439Z       2026: no records parsed
2026-07-28T20:31:29.8418674Z   Total inserted: 147 records
2026-07-28T20:31:29.8418815Z 
2026-07-28T20:31:29.8418910Z Processing: MDC_AWATERE_GLENBRAE
2026-07-28T20:31:29.8419164Z   Site: Awatere Glenbrae NRFA
2026-07-28T20:31:29.8419584Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature']
2026-07-28T20:34:35.4859092Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4860527Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20Glenbrae%20NRFA&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4861706Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4861994Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4862678Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20Glenbrae%20NRFA&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4863406Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4863700Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4864353Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20Glenbrae%20NRFA&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4865030Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4865273Z     Wind Speed: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4865895Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20Glenbrae%20NRFA&Measurement=Wind%20Speed&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4866516Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4866758Z     Wind Gust: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4867361Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20Glenbrae%20NRFA&Measurement=Wind%20Gust&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4867978Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4868275Z     Wind Direction: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4869998Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20Glenbrae%20NRFA&Measurement=Wind%20Direction&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4870876Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4871180Z     Soil Temperature: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4871948Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20Glenbrae%20NRFA&Measurement=Soil%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4872801Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4873056Z   Total inserted: 343 records
2026-07-28T20:34:35.4873208Z 
2026-07-28T20:34:35.4873322Z Processing: MDC_AWATERE_RIVER_AT_AWAPIRI
2026-07-28T20:34:35.4873582Z   Site: Awatere River at Awapiri
2026-07-28T20:34:35.4873883Z   Measurements: ['Air Temperature', 'Humidity', 'Wind Direction']
2026-07-28T20:34:35.4874218Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T20:34:35.4874860Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20River%20at%20Awapiri&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4875493Z       2026: no records parsed
2026-07-28T20:34:35.4875729Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T20:34:35.4876454Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20River%20at%20Awapiri&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4877042Z       2026: no records parsed
2026-07-28T20:34:35.4877287Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T20:34:35.4877908Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20River%20at%20Awapiri&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4878544Z       2026: no records parsed
2026-07-28T20:34:35.4878783Z   Total inserted: 0 records
2026-07-28T20:34:35.4878920Z 
2026-07-28T20:34:35.4879029Z Processing: MDC_BLENHEIM_BOWLING
2026-07-28T20:34:35.4879271Z   Site: Blenheim Bowling Club
2026-07-28T20:34:35.4879671Z   Measurements: ['Air Temperature', 'Humidity', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Barometric Pressure hPa']
2026-07-28T20:34:35.4880261Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4880888Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20Bowling%20Club&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4881551Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4881786Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4882367Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20Bowling%20Club&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4882999Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4883239Z     Wind Speed: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4883839Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20Bowling%20Club&Measurement=Wind%20Speed&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4884469Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4884714Z     Wind Gust: 2025-08-20 to 2026-07-29
2026-07-28T20:34:35.4885299Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20Bowling%20Club&Measurement=Wind%20Gust&From=20/08/2025&To=01/01/2026&Interval=30%20minutes
2026-07-28T20:34:35.4885921Z       ✓ 2025: inserted 25 records
2026-07-28T20:34:35.4886484Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20Bowling%20Club&Measurement=Wind%20Gust&From=01/01/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4887143Z       2026: no records parsed
2026-07-28T20:34:35.4887386Z     Wind Direction: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4887987Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20Bowling%20Club&Measurement=Wind%20Direction&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4888627Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4888902Z     Barometric Pressure hPa: 2026-07-27 to 2026-07-29
2026-07-28T20:34:35.4889557Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20Bowling%20Club&Measurement=Barometric%20Pressure%20hPa&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4890412Z       2026: no records parsed
2026-07-28T20:34:35.4890792Z   Total inserted: 221 records
2026-07-28T20:34:35.4890936Z 
2026-07-28T20:34:35.4891039Z Processing: MDC_BLENHEIM_OFFICE
2026-07-28T20:34:35.4891276Z   Site: Blenheim at MDC Office
2026-07-28T20:34:35.4891596Z   Measurements: ['Air Temperature', 'Rainfall', 'Barometric Pressure hPa']
2026-07-28T20:34:35.4891944Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4892557Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20at%20MDC%20Office&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4893290Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4893527Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4894117Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20at%20MDC%20Office&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4894736Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4895004Z     Barometric Pressure hPa: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4895671Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20at%20MDC%20Office&Measurement=Barometric%20Pressure%20hPa&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4896330Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4896569Z   Total inserted: 147 records
2026-07-28T20:34:35.4896713Z 
2026-07-28T20:34:35.4896820Z Processing: MDC_BRANCH_AT_BRANCH_RECORDER
2026-07-28T20:34:35.4897083Z   Site: Branch at Branch Recorder
2026-07-28T20:34:35.4897342Z   Measurements: ['Rainfall', 'Wind Direction']
2026-07-28T20:34:35.4897615Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4898201Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Branch%20at%20Branch%20Recorder&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4898839Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4899092Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T20:34:35.4899733Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Branch%20at%20Branch%20Recorder&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4900457Z       2026: no records parsed
2026-07-28T20:34:35.4900695Z   Total inserted: 49 records
2026-07-28T20:34:35.4900843Z 
2026-07-28T20:34:35.4900952Z Processing: MDC_BRANCH_AT_MT_MORRIS
2026-07-28T20:34:35.4901202Z   Site: Branch at Mt Morris
2026-07-28T20:34:35.4901530Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Direction']
2026-07-28T20:34:35.4901894Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4902545Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Branch%20at%20Mt%20Morris&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4903170Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4903402Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4903982Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Branch%20at%20Mt%20Morris&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4904671Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4904896Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T20:34:35.4905475Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Branch%20at%20Mt%20Morris&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4906071Z       ✓ 2026: inserted 49 records
2026-07-28T20:34:35.4906312Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T20:34:35.4906902Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Branch%20at%20Mt%20Morris&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:34:35.4907501Z       2026: no records parsed
2026-07-28T20:34:35.4907727Z   Total inserted: 147 records
2026-07-28T20:34:35.4907864Z 
2026-07-28T20:34:35.4907979Z Processing: MDC_FLAXBOURNE_AT_CORRIE_DOWNS
2026-07-28T20:34:35.4908246Z   Site: Flaxbourne at Corrie Downs
2026-07-28T20:34:35.4908528Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall']
2026-07-28T20:34:35.4908832Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5705174Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Flaxbourne%20at%20Corrie%20Downs&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5706718Z       ✓ 2026: inserted 49 records
2026-07-28T20:38:38.5707083Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5707978Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Flaxbourne%20at%20Corrie%20Downs&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5708963Z       ✓ 2026: inserted 49 records
2026-07-28T20:38:38.5709292Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5710465Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Flaxbourne%20at%20Corrie%20Downs&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5711413Z       ✓ 2026: inserted 49 records
2026-07-28T20:38:38.5711661Z   Total inserted: 147 records
2026-07-28T20:38:38.5711812Z 
2026-07-28T20:38:38.5711940Z Processing: MDC_FLAXBOURNE_RIVER_AT_CORRIE_DOWNS
2026-07-28T20:38:38.5712246Z   Site: Flaxbourne River at Corrie Downs
2026-07-28T20:38:38.5712570Z   Measurements: ['Rainfall', 'Wind Direction']
2026-07-28T20:38:38.5712843Z     Rainfall: 2025-11-12 to 2026-07-29
2026-07-28T20:38:38.5713478Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Flaxbourne%20River%20at%20Corrie%20Downs&Measurement=Rainfall&From=12/11/2025&To=01/01/2026&Interval=30%20minutes
2026-07-28T20:38:38.5714139Z       ✓ 2025: inserted 74 records
2026-07-28T20:38:38.5714750Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Flaxbourne%20River%20at%20Corrie%20Downs&Measurement=Rainfall&From=01/01/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5715398Z       2026: no records parsed
2026-07-28T20:38:38.5715648Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T20:38:38.5716324Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Flaxbourne%20River%20at%20Corrie%20Downs&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5717102Z       2026: no records parsed
2026-07-28T20:38:38.5717598Z   Total inserted: 74 records
2026-07-28T20:38:38.5717885Z 
2026-07-28T20:38:38.5718068Z Processing: MDC_GLENVEIGH_NRFA
2026-07-28T20:38:38.5718304Z   Site: Glenveigh NRFA
2026-07-28T20:38:38.5718764Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction']
2026-07-28T20:38:38.5719367Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5720088Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Glenveigh%20NRFA&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5720908Z       ✓ 2026: inserted 49 records
2026-07-28T20:38:38.5721156Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5721705Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Glenveigh%20NRFA&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5722300Z       ✓ 2026: inserted 49 records
2026-07-28T20:38:38.5722535Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5723078Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Glenveigh%20NRFA&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5723671Z       ✓ 2026: inserted 49 records
2026-07-28T20:38:38.5723904Z     Wind Speed: 2026-07-21 to 2026-07-29
2026-07-28T20:38:38.5724457Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Glenveigh%20NRFA&Measurement=Wind%20Speed&From=21/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5725045Z       ✓ 2026: inserted 72 records
2026-07-28T20:38:38.5725279Z     Wind Gust: 2026-07-21 to 2026-07-29
2026-07-28T20:38:38.5725922Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Glenveigh%20NRFA&Measurement=Wind%20Gust&From=21/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5726515Z       ✓ 2026: inserted 72 records
2026-07-28T20:38:38.5726761Z     Wind Direction: 2026-07-21 to 2026-07-29
2026-07-28T20:38:38.5727337Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Glenveigh%20NRFA&Measurement=Wind%20Direction&From=21/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5727934Z       ✓ 2026: inserted 72 records
2026-07-28T20:38:38.5728163Z   Total inserted: 363 records
2026-07-28T20:38:38.5728314Z 
2026-07-28T20:38:38.5728447Z Processing: MDC_KAITUNA_RAINFALL_AT_HIGGINS_BRIDGE
2026-07-28T20:38:38.5728742Z   Site: Kaituna Rainfall at Higgins Bridge
2026-07-28T20:38:38.5729000Z   Measurements: ['Rainfall']
2026-07-28T20:38:38.5729236Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5729853Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kaituna%20Rainfall%20at%20Higgins%20Bridge&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5730807Z       ✓ 2026: inserted 49 records
2026-07-28T20:38:38.5731042Z   Total inserted: 49 records
2026-07-28T20:38:38.5731186Z 
2026-07-28T20:38:38.5731310Z Processing: MDC_KAITUNA_RIVER_AT_HIGGINS_BRIDGE
2026-07-28T20:38:38.5731604Z   Site: Kaituna River at Higgins Bridge
2026-07-28T20:38:38.5731881Z   Measurements: ['Rainfall', 'Wind Direction']
2026-07-28T20:38:38.5732158Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T20:38:38.5732757Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kaituna%20River%20at%20Higgins%20Bridge&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5733400Z       2026: no records parsed
2026-07-28T20:38:38.5733639Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T20:38:38.5734286Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kaituna%20River%20at%20Higgins%20Bridge&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5734932Z       2026: no records parsed
2026-07-28T20:38:38.5735162Z   Total inserted: 0 records
2026-07-28T20:38:38.5735301Z 
2026-07-28T20:38:38.5735406Z Processing: MDC_KENEPURU_HEAD_NRFA
2026-07-28T20:38:38.5735648Z   Site: Kenepuru Head NRFA
2026-07-28T20:38:38.5736095Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature', 'Soil Moisture']
2026-07-28T20:38:38.5736562Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5737230Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kenepuru%20Head%20NRFA&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5737866Z       ✓ 2026: inserted 49 records
2026-07-28T20:38:38.5738099Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5738669Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kenepuru%20Head%20NRFA&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5739256Z       ✓ 2026: inserted 49 records
2026-07-28T20:38:38.5739493Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5740255Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kenepuru%20Head%20NRFA&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5740859Z       ✓ 2026: inserted 49 records
2026-07-28T20:38:38.5741103Z     Wind Speed: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5741685Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kenepuru%20Head%20NRFA&Measurement=Wind%20Speed&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5742298Z       ✓ 2026: inserted 49 records
2026-07-28T20:38:38.5742535Z     Wind Gust: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5743169Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kenepuru%20Head%20NRFA&Measurement=Wind%20Gust&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5743768Z       ✓ 2026: inserted 49 records
2026-07-28T20:38:38.5744015Z     Wind Direction: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5744616Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kenepuru%20Head%20NRFA&Measurement=Wind%20Direction&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5745240Z       ✓ 2026: inserted 49 records
2026-07-28T20:38:38.5745493Z     Soil Temperature: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5746107Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kenepuru%20Head%20NRFA&Measurement=Soil%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5746748Z       ✓ 2026: inserted 49 records
2026-07-28T20:38:38.5746991Z     Soil Moisture: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5747590Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kenepuru%20Head%20NRFA&Measurement=Soil%20Moisture&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5748209Z       ✓ 2026: inserted 49 records
2026-07-28T20:38:38.5748438Z   Total inserted: 392 records
2026-07-28T20:38:38.5748580Z 
2026-07-28T20:38:38.5748683Z Processing: MDC_KOROMIKO_NRFA
2026-07-28T20:38:38.5748913Z   Site: Koromiko NRFA
2026-07-28T20:38:38.5749349Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature', 'Soil Moisture']
2026-07-28T20:38:38.5749824Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5750687Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5751326Z       ✓ 2026: inserted 44 records
2026-07-28T20:38:38.5751562Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5752126Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5752710Z       ✓ 2026: inserted 44 records
2026-07-28T20:38:38.5752952Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5753502Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5754149Z       ✓ 2026: inserted 44 records
2026-07-28T20:38:38.5754386Z     Wind Speed: 2026-07-28 to 2026-07-29
2026-07-28T20:38:38.5754946Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Wind%20Speed&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:38:38.5755543Z       ✓ 2026: inserted 44 records
2026-07-28T20:38:38.5755769Z     Wind Gust: 2026-07-28 to 2026-07-29
2026-07-28T20:58:56.2938663Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Wind%20Gust&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:58:56.2940129Z       ✓ 2026: inserted 44 records
2026-07-28T20:58:56.2940511Z     Wind Direction: 2026-07-28 to 2026-07-29
2026-07-28T20:58:56.2941440Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Wind%20Direction&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:58:56.2942494Z       ✓ 2026: inserted 44 records
2026-07-28T20:58:56.2942891Z     Soil Temperature: 2026-07-28 to 2026-07-29
2026-07-28T20:58:56.2943888Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Soil%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:58:56.2945403Z       ✓ 2026: inserted 44 records
2026-07-28T20:58:56.2945790Z     Soil Moisture: 2026-07-28 to 2026-07-29
2026-07-28T20:58:56.2946769Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Soil%20Moisture&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:58:56.2947773Z       ✓ 2026: inserted 44 records
2026-07-28T20:58:56.2948124Z   Total inserted: 352 records
2026-07-28T20:58:56.2948344Z 
2026-07-28T20:58:56.2948487Z Processing: MDC_LAKE_ELTERWATER
2026-07-28T20:58:56.2948827Z   Site: Lake Elterwater Climate
2026-07-28T20:58:56.2949493Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Barometric Pressure hPa']
2026-07-28T20:58:56.2950307Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T20:58:56.2951323Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:58:56.2952172Z       ✓ 2026: inserted 49 records
2026-07-28T20:58:56.2952447Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T20:58:56.2953205Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:58:56.2953963Z       ✓ 2026: inserted 49 records
2026-07-28T20:58:56.2954281Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T20:58:56.2955062Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:58:56.2955981Z       ✓ 2026: inserted 49 records
2026-07-28T20:58:56.2956295Z     Wind Speed: 2026-07-28 to 2026-07-29
2026-07-28T20:58:56.2957040Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Wind%20Speed&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T20:58:56.2957689Z       ✓ 2026: inserted 49 records
2026-07-28T20:58:56.2957928Z     Wind Gust: 2023-12-31 to 2026-07-29
2026-07-28T20:58:56.2958532Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Wind%20Gust&From=31/12/2023&To=01/01/2024&Interval=30%20minutes
2026-07-28T20:58:56.2959161Z       ✓ 2023: inserted 49 records
2026-07-28T20:58:56.2959725Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Wind%20Gust&From=01/01/2024&To=01/01/2025&Interval=30%20minutes
2026-07-28T20:58:56.2960976Z       Database error: (psycopg2.errors.NumericValueOutOfRange) numeric field overflow
2026-07-28T20:58:56.2961468Z DETAIL:  A field with precision 10, scale 4 must round to an absolute value less than 10^6.
2026-07-28T20:58:56.2961748Z 
2026-07-28T20:58:56.2961840Z [SQL: 
2026-07-28T20:58:56.2962058Z                         INSERT INTO weather_data 
2026-07-28T20:58:56.2962377Z                             (station_id, timestamp, variable, value, unit, quality)
2026-07-28T20:58:56.2962815Z                         VALUES (%(station_id)s, %(timestamp)s, %(variable)s, %(value)s, %(unit)s, %(quality)s)
2026-07-28T20:58:56.2963210Z                         ON CONFLICT (station_id, timestamp, variable)
2026-07-28T20:58:56.2963504Z                         DO UPDATE SET
2026-07-28T20:58:56.2963758Z                             value = EXCLUDED.value,
2026-07-28T20:58:56.2964050Z                             quality = EXCLUDED.quality,
2026-07-28T20:58:56.2964317Z                             created_at = NOW()
2026-07-28T20:58:56.2964572Z                     ]
2026-07-28T20:58:56.2969086Z [parameters: [{'station_id': 100, 'timestamp': datetime.datetime(2024, 1, 1, 0, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.3354838, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2024, 1, 1, 0, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.3233333, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2024, 1, 1, 1, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.2, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2024, 1, 1, 1, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 0.9033333, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2024, 1, 1, 2, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.1, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2024, 1, 1, 2, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 0.92, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2024, 1, 1, 3, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.0129032, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2024, 1, 1, 3, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.2741935, 'unit': 'm/s', 'quality': 'GOOD'}  ... displaying 10 of 17569 total bound parameter sets ...  {'station_id': 100, 'timestamp': datetime.datetime(2024, 12, 31, 23, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 7.22, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 0, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 5.7083334, 'unit': 'm/s', 'quality': 'GOOD'}]]
2026-07-28T20:58:56.2973912Z (Background on this error at: https://sqlalche.me/e/20/9h9h)
2026-07-28T20:58:56.2974269Z       ✓ 2024: inserted 0 records
2026-07-28T20:58:56.2974873Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Wind%20Gust&From=01/01/2025&To=01/01/2026&Interval=30%20minutes
2026-07-28T20:58:56.2975589Z       Database error: (psycopg2.errors.NumericValueOutOfRange) numeric field overflow
2026-07-28T20:58:56.2976062Z DETAIL:  A field with precision 10, scale 4 must round to an absolute value less than 10^6.
2026-07-28T20:58:56.2976337Z 
2026-07-28T20:58:56.2976422Z [SQL: 
2026-07-28T20:58:56.2976633Z                         INSERT INTO weather_data 
2026-07-28T20:58:56.2977019Z                             (station_id, timestamp, variable, value, unit, quality)
2026-07-28T20:58:56.2977444Z                         VALUES (%(station_id)s, %(timestamp)s, %(variable)s, %(value)s, %(unit)s, %(quality)s)
2026-07-28T20:58:56.2977844Z                         ON CONFLICT (station_id, timestamp, variable)
2026-07-28T20:58:56.2978130Z                         DO UPDATE SET
2026-07-28T20:58:56.2978393Z                             value = EXCLUDED.value,
2026-07-28T20:58:56.2978676Z                             quality = EXCLUDED.quality,
2026-07-28T20:58:56.2978944Z                             created_at = NOW()
2026-07-28T20:58:56.2979189Z                     ]
2026-07-28T20:58:56.2983985Z [parameters: [{'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 0, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 5.7083334, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 0, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 7.1685715, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 1, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 5.163636, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 1, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 5.27561, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 2, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 5.7741935, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 2, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 5.4461539, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 3, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 5.625, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 3, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 4.509091, 'unit': 'm/s', 'quality': 'GOOD'}  ... displaying 10 of 17521 total bound parameter sets ...  {'station_id': 100, 'timestamp': datetime.datetime(2025, 12, 31, 23, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 2.4, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 0, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 3.1842105, 'unit': 'm/s', 'quality': 'GOOD'}]]
2026-07-28T21:20:26.3571279Z (Background on this error at: https://sqlalche.me/e/20/9h9h)
2026-07-28T21:20:26.3572234Z       ✓ 2025: inserted 0 records
2026-07-28T21:20:26.3573184Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Wind%20Gust&From=01/01/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3574366Z       Database error: (psycopg2.errors.NumericValueOutOfRange) numeric field overflow
2026-07-28T21:20:26.3575147Z DETAIL:  A field with precision 10, scale 4 must round to an absolute value less than 10^6.
2026-07-28T21:20:26.3575595Z 
2026-07-28T21:20:26.3575710Z [SQL: 
2026-07-28T21:20:26.3576037Z                         INSERT INTO weather_data 
2026-07-28T21:20:26.3576534Z                             (station_id, timestamp, variable, value, unit, quality)
2026-07-28T21:20:26.3577233Z                         VALUES (%(station_id)s, %(timestamp)s, %(variable)s, %(value)s, %(unit)s, %(quality)s)
2026-07-28T21:20:26.3577877Z                         ON CONFLICT (station_id, timestamp, variable)
2026-07-28T21:20:26.3578320Z                         DO UPDATE SET
2026-07-28T21:20:26.3578715Z                             value = EXCLUDED.value,
2026-07-28T21:20:26.3579195Z                             quality = EXCLUDED.quality,
2026-07-28T21:20:26.3580239Z                             created_at = NOW()
2026-07-28T21:20:26.3580602Z                     ]
2026-07-28T21:20:26.3587199Z [parameters: [{'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 0, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 3.1842105, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 0, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 4.3909089, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 1, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 3.721428624, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 1, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 5.1800001, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 2, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.490476, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 2, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 4.2380952, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 3, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.842857, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 3, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.36, 'unit': 'm/s', 'quality': 'GOOD'}  ... displaying 10 of 10033 total bound parameter sets ...  {'station_id': 100, 'timestamp': datetime.datetime(2026, 7, 28, 23, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': -3.4028234663852886e+38, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 7, 29, 0, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': -3.4028234663852886e+38, 'unit': 'm/s', 'quality': 'GOOD'}]]
2026-07-28T21:20:26.3595094Z (Background on this error at: https://sqlalche.me/e/20/9h9h)
2026-07-28T21:20:26.3595567Z       ✓ 2026: inserted 0 records
2026-07-28T21:20:26.3595841Z     Wind Direction: 2026-07-05 to 2026-07-29
2026-07-28T21:20:26.3596476Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Wind%20Direction&From=05/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3597145Z       ✓ 2026: inserted 54 records
2026-07-28T21:20:26.3597421Z     Barometric Pressure hPa: 2026-07-28 to 2026-07-29
2026-07-28T21:20:26.3598078Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Barometric%20Pressure%20hPa&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3598759Z       ✓ 2026: inserted 49 records
2026-07-28T21:20:26.3598996Z   Total inserted: 348 records
2026-07-28T21:20:26.3599145Z 
2026-07-28T21:20:26.3599250Z Processing: MDC_LANSDOWNE_NRFA
2026-07-28T21:20:26.3599482Z   Site: Lansdowne NRFA
2026-07-28T21:20:26.3600091Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature', 'Soil Moisture']
2026-07-28T21:20:26.3600709Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:20:26.3601358Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lansdowne%20NRFA&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3602004Z       ✓ 2026: inserted 49 records
2026-07-28T21:20:26.3602279Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T21:20:26.3602847Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lansdowne%20NRFA&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3603652Z       ✓ 2026: inserted 49 records
2026-07-28T21:20:26.3603890Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T21:20:26.3604463Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lansdowne%20NRFA&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3605055Z       ✓ 2026: inserted 49 records
2026-07-28T21:20:26.3605302Z     Wind Speed: 2026-07-28 to 2026-07-29
2026-07-28T21:20:26.3605869Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lansdowne%20NRFA&Measurement=Wind%20Speed&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3606469Z       ✓ 2026: inserted 49 records
2026-07-28T21:20:26.3606708Z     Wind Gust: 2026-07-28 to 2026-07-29
2026-07-28T21:20:26.3607266Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lansdowne%20NRFA&Measurement=Wind%20Gust&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3607865Z       ✓ 2026: inserted 49 records
2026-07-28T21:20:26.3608103Z     Wind Direction: 2026-07-28 to 2026-07-29
2026-07-28T21:20:26.3608772Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lansdowne%20NRFA&Measurement=Wind%20Direction&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3609392Z       ✓ 2026: inserted 49 records
2026-07-28T21:20:26.3609633Z     Soil Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:20:26.3610479Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lansdowne%20NRFA&Measurement=Soil%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3611107Z       ✓ 2026: inserted 49 records
2026-07-28T21:20:26.3611355Z     Soil Moisture: 2026-07-28 to 2026-07-29
2026-07-28T21:20:26.3611922Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lansdowne%20NRFA&Measurement=Soil%20Moisture&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3612530Z       ✓ 2026: inserted 49 records
2026-07-28T21:20:26.3612772Z   Total inserted: 392 records
2026-07-28T21:20:26.3612914Z 
2026-07-28T21:20:26.3613015Z Processing: MDC_MALINGS
2026-07-28T21:20:26.3613237Z   Site: Malings
2026-07-28T21:20:26.3613456Z   Measurements: ['Rainfall']
2026-07-28T21:20:26.3613698Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T21:20:26.3614227Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Malings&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3614802Z       ✓ 2026: inserted 49 records
2026-07-28T21:20:26.3615031Z   Total inserted: 49 records
2026-07-28T21:20:26.3615173Z 
2026-07-28T21:20:26.3615282Z Processing: MDC_MID_AWATERE_VALLEY_NRFA
2026-07-28T21:20:26.3615544Z   Site: Mid Awatere Valley NRFA
2026-07-28T21:20:26.3615990Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature', 'Soil Moisture']
2026-07-28T21:20:26.3616466Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:20:26.3617077Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Mid%20Awatere%20Valley%20NRFA&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3617718Z       ✓ 2026: inserted 49 records
2026-07-28T21:20:26.3617947Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T21:20:26.3618527Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Mid%20Awatere%20Valley%20NRFA&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3619151Z       ✓ 2026: inserted 49 records
2026-07-28T21:20:26.3619383Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T21:20:26.3620069Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Mid%20Awatere%20Valley%20NRFA&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3620778Z       ✓ 2026: inserted 49 records
2026-07-28T21:20:26.3621027Z     Wind Speed: 2026-07-28 to 2026-07-29
2026-07-28T21:20:26.3621641Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Mid%20Awatere%20Valley%20NRFA&Measurement=Wind%20Speed&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3622268Z       ✓ 2026: inserted 49 records
2026-07-28T21:20:26.3622507Z     Wind Gust: 2026-07-28 to 2026-07-29
2026-07-28T21:20:26.3623096Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Mid%20Awatere%20Valley%20NRFA&Measurement=Wind%20Gust&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:20:26.3623720Z       ✓ 2026: inserted 49 records
2026-07-28T21:20:26.3623964Z     Wind Direction: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7678945Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Mid%20Awatere%20Valley%20NRFA&Measurement=Wind%20Direction&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7680178Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7680479Z     Soil Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7681644Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Mid%20Awatere%20Valley%20NRFA&Measurement=Soil%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7682335Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7682583Z     Soil Moisture: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7683203Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Mid%20Awatere%20Valley%20NRFA&Measurement=Soil%20Moisture&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7683842Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7684100Z   Total inserted: 392 records
2026-07-28T21:24:10.7684254Z 
2026-07-28T21:24:10.7684362Z Processing: MDC_MOLESWORTH_NRFA
2026-07-28T21:24:10.7684604Z   Site: Molesworth NRFA
2026-07-28T21:24:10.7685045Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature', 'Soil Moisture']
2026-07-28T21:24:10.7685528Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7686139Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Molesworth%20NRFA&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7686757Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7687031Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7687596Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Molesworth%20NRFA&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7688229Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7688634Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7689248Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Molesworth%20NRFA&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7690135Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7690534Z     Wind Speed: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7691113Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Molesworth%20NRFA&Measurement=Wind%20Speed&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7691724Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7691957Z     Wind Gust: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7692526Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Molesworth%20NRFA&Measurement=Wind%20Gust&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7693248Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7693495Z     Wind Direction: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7694092Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Molesworth%20NRFA&Measurement=Wind%20Direction&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7694699Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7694964Z     Soil Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7695578Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Molesworth%20NRFA&Measurement=Soil%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7696208Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7696453Z     Soil Moisture: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7697041Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Molesworth%20NRFA&Measurement=Soil%20Moisture&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7697662Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7697895Z   Total inserted: 392 records
2026-07-28T21:24:10.7698042Z 
2026-07-28T21:24:10.7698147Z Processing: MDC_NGARURU_NRFA
2026-07-28T21:24:10.7698380Z   Site: Ngaruru NRFA
2026-07-28T21:24:10.7698953Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Barometric Pressure hPa', 'Soil Temperature', 'Soil Moisture']
2026-07-28T21:24:10.7699505Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7700212Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7700869Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7701107Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7701663Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7702246Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7702480Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7703031Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7703600Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7703837Z     Wind Speed: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7704393Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Wind%20Speed&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7704985Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7705218Z     Wind Gust: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7705761Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Wind%20Gust&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7706352Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7706591Z     Wind Direction: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7707176Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Wind%20Direction&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7707770Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7708039Z     Barometric Pressure hPa: 2022-12-13 to 2026-07-29
2026-07-28T21:24:10.7708662Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Barometric%20Pressure%20hPa&From=13/12/2022&To=01/01/2023&Interval=30%20minutes
2026-07-28T21:24:10.7709293Z       ✓ 2022: inserted 68 records
2026-07-28T21:24:10.7709877Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Barometric%20Pressure%20hPa&From=01/01/2023&To=01/01/2024&Interval=30%20minutes
2026-07-28T21:24:10.7710649Z       2023: no records parsed
2026-07-28T21:24:10.7711234Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Barometric%20Pressure%20hPa&From=01/01/2024&To=01/01/2025&Interval=30%20minutes
2026-07-28T21:24:10.7711849Z       2024: no records parsed
2026-07-28T21:24:10.7712433Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Barometric%20Pressure%20hPa&From=01/01/2025&To=01/01/2026&Interval=30%20minutes
2026-07-28T21:24:10.7713038Z       2025: no records parsed
2026-07-28T21:24:10.7713617Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Barometric%20Pressure%20hPa&From=01/01/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7714223Z       2026: no records parsed
2026-07-28T21:24:10.7714469Z     Soil Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7715072Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Soil%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7715693Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7715940Z     Soil Moisture: 2026-07-28 to 2026-07-29
2026-07-28T21:24:10.7716587Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Soil%20Moisture&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7717168Z       ✓ 2026: inserted 49 records
2026-07-28T21:24:10.7717407Z   Total inserted: 460 records
2026-07-28T21:24:10.7717548Z 
2026-07-28T21:24:10.7717650Z Processing: MDC_O_DWYERS_ROAD
2026-07-28T21:24:10.7717883Z   Site: O Dwyers Road NRFA
2026-07-28T21:24:10.7718161Z   Measurements: ['Air Temperature', 'Rainfall', 'Humidity']
2026-07-28T21:24:10.7718478Z     Air Temperature: 2022-07-27 to 2026-07-29
2026-07-28T21:24:10.7719082Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Air%20Temperature&From=27/07/2022&To=01/01/2023&Interval=30%20minutes
2026-07-28T21:24:10.7719713Z       ✓ 2022: inserted 32 records
2026-07-28T21:24:10.7720365Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Air%20Temperature&From=01/01/2023&To=01/01/2024&Interval=30%20minutes
2026-07-28T21:24:10.7720972Z       2023: no records parsed
2026-07-28T21:24:10.7721534Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Air%20Temperature&From=01/01/2024&To=01/01/2025&Interval=30%20minutes
2026-07-28T21:24:10.7722133Z       2024: no records parsed
2026-07-28T21:24:10.7722699Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Air%20Temperature&From=01/01/2025&To=01/01/2026&Interval=30%20minutes
2026-07-28T21:24:10.7723293Z       2025: no records parsed
2026-07-28T21:24:10.7723855Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Air%20Temperature&From=01/01/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:24:10.7724462Z       2026: no records parsed
2026-07-28T21:24:10.7724697Z     Rainfall: 2022-07-27 to 2026-07-29
2026-07-28T21:24:10.7725269Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Rainfall&From=27/07/2022&To=01/01/2023&Interval=30%20minutes
2026-07-28T21:24:10.7725888Z       ✓ 2022: inserted 32 records
2026-07-28T21:27:06.5113062Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Rainfall&From=01/01/2023&To=01/01/2024&Interval=30%20minutes
2026-07-28T21:27:06.5114763Z       2023: no records parsed
2026-07-28T21:27:06.5115768Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Rainfall&From=01/01/2024&To=01/01/2025&Interval=30%20minutes
2026-07-28T21:27:06.5116767Z       2024: no records parsed
2026-07-28T21:27:06.5117748Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Rainfall&From=01/01/2025&To=01/01/2026&Interval=30%20minutes
2026-07-28T21:27:06.5118732Z       2025: no records parsed
2026-07-28T21:27:06.5119698Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Rainfall&From=01/01/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5120873Z       2026: no records parsed
2026-07-28T21:27:06.5121238Z     Humidity: 2022-07-27 to 2026-07-29
2026-07-28T21:27:06.5122136Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Humidity&From=27/07/2022&To=01/01/2023&Interval=30%20minutes
2026-07-28T21:27:06.5123351Z       ✓ 2022: inserted 32 records
2026-07-28T21:27:06.5124420Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Humidity&From=01/01/2023&To=01/01/2024&Interval=30%20minutes
2026-07-28T21:27:06.5125128Z       2023: no records parsed
2026-07-28T21:27:06.5125869Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Humidity&From=01/01/2024&To=01/01/2025&Interval=30%20minutes
2026-07-28T21:27:06.5126603Z       2024: no records parsed
2026-07-28T21:27:06.5127343Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Humidity&From=01/01/2025&To=01/01/2026&Interval=30%20minutes
2026-07-28T21:27:06.5128154Z       2025: no records parsed
2026-07-28T21:27:06.5128889Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Humidity&From=01/01/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5129471Z       2026: no records parsed
2026-07-28T21:27:06.5129705Z   Total inserted: 96 records
2026-07-28T21:27:06.5129855Z 
2026-07-28T21:27:06.5130147Z Processing: MDC_OMAKA_AT_RAMSHEAD_SADDLE
2026-07-28T21:27:06.5130428Z   Site: Omaka at Ramshead Saddle
2026-07-28T21:27:06.5130756Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Direction']
2026-07-28T21:27:06.5131120Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5131745Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Omaka%20at%20Ramshead%20Saddle&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5132476Z       ✓ 2026: inserted 49 records
2026-07-28T21:27:06.5132725Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5133324Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Omaka%20at%20Ramshead%20Saddle&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5133953Z       ✓ 2026: inserted 49 records
2026-07-28T21:27:06.5134196Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5134792Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Omaka%20at%20Ramshead%20Saddle&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5135419Z       ✓ 2026: inserted 49 records
2026-07-28T21:27:06.5135674Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T21:27:06.5136282Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Omaka%20at%20Ramshead%20Saddle&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5137054Z       2026: no records parsed
2026-07-28T21:27:06.5137296Z   Total inserted: 147 records
2026-07-28T21:27:06.5137472Z 
2026-07-28T21:27:06.5137613Z Processing: MDC_ONAMALUTU_AT_BARTLETTS_CREEK_SADDLE
2026-07-28T21:27:06.5137917Z   Site: Onamalutu at Bartletts Creek Saddle
2026-07-28T21:27:06.5138195Z   Measurements: ['Rainfall']
2026-07-28T21:27:06.5138428Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5139069Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Bartletts%20Creek%20Saddle&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5139733Z       ✓ 2026: inserted 49 records
2026-07-28T21:27:06.5140072Z   Total inserted: 49 records
2026-07-28T21:27:06.5140219Z 
2026-07-28T21:27:06.5140343Z Processing: MDC_ONAMALUTU_AT_HILLTOP_ROAD_NRFA
2026-07-28T21:27:06.5140620Z   Site: Onamalutu at Hilltop Road NRFA
2026-07-28T21:27:06.5141090Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature', 'Soil Moisture']
2026-07-28T21:27:06.5141565Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5142225Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Hilltop%20Road%20NRFA&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5142981Z       ✓ 2026: inserted 49 records
2026-07-28T21:27:06.5143223Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5143824Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Hilltop%20Road%20NRFA&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5144648Z       ✓ 2026: inserted 49 records
2026-07-28T21:27:06.5144887Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5145494Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Hilltop%20Road%20NRFA&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5146158Z       ✓ 2026: inserted 49 records
2026-07-28T21:27:06.5146388Z     Wind Speed: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5147016Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Hilltop%20Road%20NRFA&Measurement=Wind%20Speed&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5147680Z       ✓ 2026: inserted 49 records
2026-07-28T21:27:06.5147912Z     Wind Gust: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5148533Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Hilltop%20Road%20NRFA&Measurement=Wind%20Gust&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5149176Z       ✓ 2026: inserted 49 records
2026-07-28T21:27:06.5149423Z     Wind Direction: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5150152Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Hilltop%20Road%20NRFA&Measurement=Wind%20Direction&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5150826Z       ✓ 2026: inserted 49 records
2026-07-28T21:27:06.5151078Z     Soil Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5151730Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Hilltop%20Road%20NRFA&Measurement=Soil%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5152410Z       ✓ 2026: inserted 49 records
2026-07-28T21:27:06.5152647Z     Soil Moisture: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5153281Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Hilltop%20Road%20NRFA&Measurement=Soil%20Moisture&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5153944Z       ✓ 2026: inserted 49 records
2026-07-28T21:27:06.5154257Z   Total inserted: 392 records
2026-07-28T21:27:06.5154408Z 
2026-07-28T21:27:06.5154517Z Processing: MDC_PELORUS_AT_1446
2026-07-28T21:27:06.5154765Z   Site: Pelorus at 1446
2026-07-28T21:27:06.5155083Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Direction']
2026-07-28T21:27:06.5155443Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5156062Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pelorus%20at%201446&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5156704Z       ✓ 2026: inserted 49 records
2026-07-28T21:27:06.5156944Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5157513Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pelorus%20at%201446&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5158111Z       ✓ 2026: inserted 49 records
2026-07-28T21:27:06.5158362Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5158922Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pelorus%20at%201446&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5159529Z       ✓ 2026: inserted 49 records
2026-07-28T21:27:06.5159783Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T21:27:06.5160502Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pelorus%20at%201446&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5161095Z       2026: no records parsed
2026-07-28T21:27:06.5161326Z   Total inserted: 147 records
2026-07-28T21:27:06.5161472Z 
2026-07-28T21:27:06.5161600Z Processing: MDC_PICTON_CLIMATE_AT_WAITOHI_DOMAIN
2026-07-28T21:27:06.5161926Z   Site: Picton Climate at Waitohi Domain
2026-07-28T21:27:06.5162386Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Barometric Pressure hPa']
2026-07-28T21:27:06.5162857Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5163501Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Picton%20Climate%20at%20Waitohi%20Domain&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5164179Z       ✓ 2026: inserted 49 records
2026-07-28T21:27:06.5164419Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T21:27:06.5165043Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Picton%20Climate%20at%20Waitohi%20Domain&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:27:06.5165704Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7705365Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7706679Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Picton%20Climate%20at%20Waitohi%20Domain&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7708155Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7708535Z     Wind Speed: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7709553Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Picton%20Climate%20at%20Waitohi%20Domain&Measurement=Wind%20Speed&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7710864Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7711197Z     Wind Gust: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7712178Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Picton%20Climate%20at%20Waitohi%20Domain&Measurement=Wind%20Gust&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7712846Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7713089Z     Wind Direction: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7713728Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Picton%20Climate%20at%20Waitohi%20Domain&Measurement=Wind%20Direction&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7714770Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7715048Z     Barometric Pressure hPa: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7715793Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Picton%20Climate%20at%20Waitohi%20Domain&Measurement=Barometric%20Pressure%20hPa&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7716657Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7716957Z   Total inserted: 343 records
2026-07-28T21:31:17.7717229Z 
2026-07-28T21:31:17.7717335Z Processing: MDC_PUDDING_HILL_NRFA
2026-07-28T21:31:17.7717602Z   Site: Pudding Hill NRFA
2026-07-28T21:31:17.7718185Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature', 'Soil Moisture']
2026-07-28T21:31:17.7718676Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7719374Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7720158Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7720398Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7721107Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7721705Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7721942Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7722497Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7723093Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7723343Z     Wind Speed: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7723913Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Wind%20Speed&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7724515Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7724744Z     Wind Gust: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7725314Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Wind%20Gust&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7725919Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7726184Z     Wind Direction: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7726785Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Wind%20Direction&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7727405Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7727651Z     Soil Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7728263Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Soil%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7728887Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7729135Z     Soil Moisture: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7729722Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Soil%20Moisture&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7730433Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7730675Z   Total inserted: 392 records
2026-07-28T21:31:17.7730813Z 
2026-07-28T21:31:17.7730922Z Processing: MDC_RAI_AT_RAI_FALLS
2026-07-28T21:31:17.7731163Z   Site: Rai at Rai Falls
2026-07-28T21:31:17.7731460Z   Measurements: ['Rainfall', 'Wind Direction', 'Barometric Pressure hPa']
2026-07-28T21:31:17.7731871Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7732438Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20at%20Rai%20Falls&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7733038Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7733292Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T21:31:17.7733887Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20at%20Rai%20Falls&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7734486Z       2026: no records parsed
2026-07-28T21:31:17.7734746Z     Barometric Pressure hPa: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7735403Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20at%20Rai%20Falls&Measurement=Barometric%20Pressure%20hPa&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7736054Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7736293Z   Total inserted: 98 records
2026-07-28T21:31:17.7736437Z 
2026-07-28T21:31:17.7736539Z Processing: MDC_RAI_VALLEY_NRFA
2026-07-28T21:31:17.7736771Z   Site: Rai Valley NRFA
2026-07-28T21:31:17.7737346Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Barometric Pressure hPa', 'Soil Temperature', 'Soil Moisture']
2026-07-28T21:31:17.7737879Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7738496Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Air%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7739115Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7739350Z     Humidity: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7739989Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Humidity&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7740597Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7740830Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7741378Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7741974Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7742208Z     Wind Speed: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7742777Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Wind%20Speed&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7743381Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7743612Z     Wind Gust: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7744175Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Wind%20Gust&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7745065Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7745320Z     Wind Direction: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7746100Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Wind%20Direction&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7746920Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7747432Z     Barometric Pressure hPa: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7748064Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Barometric%20Pressure%20hPa&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7748719Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7748965Z     Soil Temperature: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7749686Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Soil%20Temperature&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7750527Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7750769Z     Soil Moisture: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7751380Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Soil%20Moisture&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7752002Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7752242Z   Total inserted: 441 records
2026-07-28T21:31:17.7752388Z 
2026-07-28T21:31:17.7752494Z Processing: MDC_RARANGI_AT_DRIVING_RANGE
2026-07-28T21:31:17.7752758Z   Site: Rarangi at Driving Range
2026-07-28T21:31:17.7752997Z   Measurements: ['Rainfall']
2026-07-28T21:31:17.7753234Z     Rainfall: 2026-07-28 to 2026-07-29
2026-07-28T21:31:17.7753833Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rarangi%20at%20Driving%20Range&Measurement=Rainfall&From=28/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T21:31:17.7754462Z       ✓ 2026: inserted 49 records
2026-07-28T21:31:17.7754697Z   Total inserted: 49 records
2026-07-28T21:31:17.7754831Z 
2026-07-28T21:31:17.7754930Z Processing: MDC_RED_HILLS
2026-07-28T21:31:17.7755233Z   Site: Red Hills
2026-07-28T21:31:17.7755489Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall']
2026-07-28T21:31:17.7755800Z     Air Temperature: 2026-07-28 to 2026-07-29
2026-07-28T22:52:51.2448872Z ##[error]The operation was canceled.
2026-07-28T22:52:51.2556880Z Node 20 is being deprecated. This workflow is running with Node 24 by default. If you need to temporarily use Node 20, you can set the ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true environment variable. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
2026-07-28T22:52:51.2557850Z Post job cleanup.
2026-07-28T22:52:51.3274943Z [command]/usr/bin/git version
2026-07-28T22:52:51.3313721Z git version 2.54.0
2026-07-28T22:52:51.3348035Z Temporarily overriding HOME='/home/runner/work/_temp/8e3cbc5b-fdd3-4dfb-867e-19d7b05a92b6' before making global git config changes
2026-07-28T22:52:51.3348977Z Adding repository directory to the temporary git global config as a safe directory
2026-07-28T22:52:51.3354140Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/auxein-insights/auxein-insights
2026-07-28T22:52:51.3385758Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-07-28T22:52:51.3412586Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-07-28T22:52:51.3598644Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-07-28T22:52:51.3616955Z http.https://github.com/.extraheader
2026-07-28T22:52:51.3625233Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
2026-07-28T22:52:51.3651377Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-07-28T22:52:51.3839103Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
2026-07-28T22:52:51.3863446Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
2026-07-28T22:52:51.4181088Z Cleaning up orphan processes
2026-07-28T22:52:51.4294004Z Terminate orphan process: pid (2654) (python)
2026-07-28T22:52:51.4402936Z ##[warning]Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/setup-python@v5. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/