2026-07-28T14:20:16.3852858Z Current runner version: '2.336.0'
2026-07-28T14:20:16.3886947Z ##[group]Runner Image Provisioner
2026-07-28T14:20:16.3888800Z Hosted Compute Agent
2026-07-28T14:20:16.3889874Z Version: 20260707.563
2026-07-28T14:20:16.3892091Z Commit: 02667638d2b423fbc733a8e32a88b44996a3ba6e
2026-07-28T14:20:16.3893580Z Build Date: 2026-07-07T19:33:50Z
2026-07-28T14:20:16.3894867Z Worker ID: {1fd26b4c-bfad-4674-98c7-6f013d110797}
2026-07-28T14:20:16.3896551Z Azure Region: eastus
2026-07-28T14:20:16.3897551Z ##[endgroup]
2026-07-28T14:20:16.3900225Z ##[group]Operating System
2026-07-28T14:20:16.3901767Z Ubuntu
2026-07-28T14:20:16.3902898Z 24.04.4
2026-07-28T14:20:16.3903835Z LTS
2026-07-28T14:20:16.3904884Z ##[endgroup]
2026-07-28T14:20:16.3906253Z ##[group]Runner Image
2026-07-28T14:20:16.3907519Z Image: ubuntu-24.04
2026-07-28T14:20:16.3908565Z Version: 20260720.247.2
2026-07-28T14:20:16.3910896Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20260720.247/images/ubuntu/Ubuntu2404-Readme.md
2026-07-28T14:20:16.3913736Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20260720.247
2026-07-28T14:20:16.3915821Z ##[endgroup]
2026-07-28T14:20:16.3918097Z ##[group]GITHUB_TOKEN Permissions
2026-07-28T14:20:16.3920766Z Contents: read
2026-07-28T14:20:16.3921905Z Metadata: read
2026-07-28T14:20:16.3922856Z Packages: read
2026-07-28T14:20:16.3924063Z ##[endgroup]
2026-07-28T14:20:16.3927935Z Secret source: Actions
2026-07-28T14:20:16.3930046Z Prepare workflow directory
2026-07-28T14:20:16.4397812Z Prepare all required actions
2026-07-28T14:20:16.4468029Z Getting action download info
2026-07-28T14:20:16.6670847Z Download action repository 'actions/checkout@v4' (SHA:11d5960a326750d5838078e36cf38b85af677262)
2026-07-28T14:20:16.8758716Z Download action repository 'actions/setup-python@v5' (SHA:a26af69be951a213d495a4c3e4e4022e16d87065)
2026-07-28T14:20:17.0541717Z Complete job name: ingest-weather
2026-07-28T14:20:17.1398129Z Node 20 is being deprecated. This workflow is running with Node 24 by default. If you need to temporarily use Node 20, you can set the ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true environment variable. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
2026-07-28T14:20:17.1408584Z ##[group]Run actions/checkout@v4
2026-07-28T14:20:17.1409382Z with:
2026-07-28T14:20:17.1409923Z   repository: PeteTaylor89/auxein-insights
2026-07-28T14:20:17.1413884Z   token: ***
2026-07-28T14:20:17.1414363Z   ssh-strict: true
2026-07-28T14:20:17.1414843Z   ssh-user: git
2026-07-28T14:20:17.1415625Z   persist-credentials: true
2026-07-28T14:20:17.1416165Z   clean: true
2026-07-28T14:20:17.1416656Z   sparse-checkout-cone-mode: true
2026-07-28T14:20:17.1417224Z   fetch-depth: 1
2026-07-28T14:20:17.1417697Z   fetch-tags: false
2026-07-28T14:20:17.1418196Z   show-progress: true
2026-07-28T14:20:17.1418679Z   lfs: false
2026-07-28T14:20:17.1419179Z   submodules: false
2026-07-28T14:20:17.1419904Z   set-safe-directory: true
2026-07-28T14:20:17.1420811Z   allow-unsafe-pr-checkout: false
2026-07-28T14:20:17.1422101Z ##[endgroup]
2026-07-28T14:20:17.2517644Z Syncing repository: PeteTaylor89/auxein-insights
2026-07-28T14:20:17.2519538Z ##[group]Getting Git version info
2026-07-28T14:20:17.2520390Z Working directory is '/home/runner/work/auxein-insights/auxein-insights'
2026-07-28T14:20:17.2521594Z [command]/usr/bin/git version
2026-07-28T14:20:17.3421682Z git version 2.54.0
2026-07-28T14:20:17.3486868Z ##[endgroup]
2026-07-28T14:20:17.3507740Z Temporarily overriding HOME='/home/runner/work/_temp/ad06f175-f1c6-42d1-be8b-3c18293fc0c4' before making global git config changes
2026-07-28T14:20:17.3510342Z Adding repository directory to the temporary git global config as a safe directory
2026-07-28T14:20:17.3512526Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/auxein-insights/auxein-insights
2026-07-28T14:20:17.3559708Z Deleting the contents of '/home/runner/work/auxein-insights/auxein-insights'
2026-07-28T14:20:17.3563514Z ##[group]Initializing the repository
2026-07-28T14:20:17.3568205Z [command]/usr/bin/git init /home/runner/work/auxein-insights/auxein-insights
2026-07-28T14:20:17.3688986Z hint: Using 'master' as the name for the initial branch. This default branch name
2026-07-28T14:20:17.3690267Z hint: will change to "main" in Git 3.0. To configure the initial branch name
2026-07-28T14:20:17.3691623Z hint: to use in all of your new repositories, which will suppress this warning,
2026-07-28T14:20:17.3693040Z hint: call:
2026-07-28T14:20:17.3693818Z hint:
2026-07-28T14:20:17.3694761Z hint: 	git config --global init.defaultBranch <name>
2026-07-28T14:20:17.3696103Z hint:
2026-07-28T14:20:17.3696907Z hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
2026-07-28T14:20:17.3698371Z hint: 'development'. The just-created branch can be renamed via this command:
2026-07-28T14:20:17.3699176Z hint:
2026-07-28T14:20:17.3700021Z hint: 	git branch -m <name>
2026-07-28T14:20:17.3700847Z hint:
2026-07-28T14:20:17.3701643Z hint: Disable this message with "git config set advice.defaultBranchName false"
2026-07-28T14:20:17.3702817Z Initialized empty Git repository in /home/runner/work/auxein-insights/auxein-insights/.git/
2026-07-28T14:20:17.3721956Z [command]/usr/bin/git remote add origin https://github.com/PeteTaylor89/auxein-insights
2026-07-28T14:20:17.3762557Z ##[endgroup]
2026-07-28T14:20:17.3763839Z ##[group]Disabling automatic garbage collection
2026-07-28T14:20:17.3767661Z [command]/usr/bin/git config --local gc.auto 0
2026-07-28T14:20:17.3805117Z ##[endgroup]
2026-07-28T14:20:17.3806408Z ##[group]Setting up auth
2026-07-28T14:20:17.3814431Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-07-28T14:20:17.3857749Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-07-28T14:20:17.4272622Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-07-28T14:20:17.4309421Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-07-28T14:20:17.4549215Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
2026-07-28T14:20:17.4587002Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
2026-07-28T14:20:17.4838476Z [command]/usr/bin/git config --local http.https://github.com/.extraheader AUTHORIZATION: basic ***
2026-07-28T14:20:17.4879428Z ##[endgroup]
2026-07-28T14:20:17.4880274Z ##[group]Fetching the repository
2026-07-28T14:20:17.4889086Z [command]/usr/bin/git -c protocol.version=2 fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +08769f92bee750644a5eff29cd660fd7beb2dc33:refs/remotes/origin/main
2026-07-28T14:20:21.3811333Z From https://github.com/PeteTaylor89/auxein-insights
2026-07-28T14:20:21.3813388Z  * [new ref]         08769f92bee750644a5eff29cd660fd7beb2dc33 -> origin/main
2026-07-28T14:20:21.3855460Z ##[endgroup]
2026-07-28T14:20:21.3857469Z ##[group]Determining the checkout info
2026-07-28T14:20:21.3859623Z ##[endgroup]
2026-07-28T14:20:21.3866280Z [command]/usr/bin/git sparse-checkout disable
2026-07-28T14:20:21.3913413Z [command]/usr/bin/git config --local --unset-all extensions.worktreeConfig
2026-07-28T14:20:21.3946305Z ##[group]Checking out the ref
2026-07-28T14:20:21.3950932Z [command]/usr/bin/git checkout --progress --force -B main refs/remotes/origin/main
2026-07-28T14:20:22.0399293Z Switched to a new branch 'main'
2026-07-28T14:20:22.0412334Z branch 'main' set up to track 'origin/main'.
2026-07-28T14:20:22.0455503Z ##[endgroup]
2026-07-28T14:20:22.0502887Z [command]/usr/bin/git log -1 --format=%H
2026-07-28T14:20:22.0530074Z 08769f92bee750644a5eff29cd660fd7beb2dc33
2026-07-28T14:20:22.0911535Z Node 20 is being deprecated. This workflow is running with Node 24 by default. If you need to temporarily use Node 20, you can set the ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true environment variable. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
2026-07-28T14:20:22.0917849Z ##[group]Run actions/setup-python@v5
2026-07-28T14:20:22.0919147Z with:
2026-07-28T14:20:22.0920099Z   python-version: 3.11
2026-07-28T14:20:22.0921199Z   check-latest: false
2026-07-28T14:20:22.0932055Z   token: ***
2026-07-28T14:20:22.0933084Z   update-environment: true
2026-07-28T14:20:22.0934260Z   allow-prereleases: false
2026-07-28T14:20:22.0935572Z   freethreaded: false
2026-07-28T14:20:22.0936633Z ##[endgroup]
2026-07-28T14:20:22.2310784Z ##[group]Installed versions
2026-07-28T14:20:22.2449711Z (node:2225) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
2026-07-28T14:20:22.2454465Z (Use `node --trace-deprecation ...` to show where the warning was created)
2026-07-28T14:20:22.2457777Z Successfully set up CPython (3.11.15)
2026-07-28T14:20:22.2460823Z ##[endgroup]
2026-07-28T14:20:22.2695373Z ##[group]Run sudo apt-get update
2026-07-28T14:20:22.2697373Z [36;1msudo apt-get update[0m
2026-07-28T14:20:22.2699396Z [36;1msudo apt-get install -y postgresql-client[0m
2026-07-28T14:20:22.2774884Z shell: /usr/bin/bash -e {0}
2026-07-28T14:20:22.2776355Z env:
2026-07-28T14:20:22.2777598Z   pythonLocation: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T14:20:22.2780234Z   PKG_CONFIG_PATH: /opt/hostedtoolcache/Python/3.11.15/x64/lib/pkgconfig
2026-07-28T14:20:22.2783228Z   Python_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T14:20:22.2785600Z   Python2_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T14:20:22.2787706Z   Python3_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T14:20:22.2790117Z   LD_LIBRARY_PATH: /opt/hostedtoolcache/Python/3.11.15/x64/lib
2026-07-28T14:20:22.2792932Z ##[endgroup]
2026-07-28T14:20:22.3859806Z Get:1 file:/etc/apt/apt-mirrors.txt Mirrorlist [144 B]
2026-07-28T14:20:22.4072820Z Hit:6 https://packages.microsoft.com/repos/azure-cli noble InRelease
2026-07-28T14:20:22.4077932Z Get:7 https://packages.microsoft.com/ubuntu/24.04/prod noble InRelease [3600 B]
2026-07-28T14:20:22.4160652Z Get:8 https://dl.google.com/linux/chrome-stable/deb stable InRelease [2548 B]
2026-07-28T14:20:22.4930490Z Hit:2 http://azure.archive.ubuntu.com/ubuntu noble InRelease
2026-07-28T14:20:22.4948116Z Get:3 http://azure.archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]
2026-07-28T14:20:22.4989855Z Get:4 http://azure.archive.ubuntu.com/ubuntu noble-backports InRelease [126 kB]
2026-07-28T14:20:22.5021317Z Get:5 http://azure.archive.ubuntu.com/ubuntu noble-security InRelease [126 kB]
2026-07-28T14:20:22.5105306Z Get:9 https://packages.microsoft.com/ubuntu/24.04/prod noble/main arm64 Packages [213 kB]
2026-07-28T14:20:22.5247816Z Get:10 https://packages.microsoft.com/ubuntu/24.04/prod noble/main armhf Packages [11.7 kB]
2026-07-28T14:20:22.5294464Z Get:11 https://packages.microsoft.com/ubuntu/24.04/prod noble/main amd64 Packages [247 kB]
2026-07-28T14:20:22.5849233Z Get:12 https://dl.google.com/linux/chrome-stable/deb stable/main amd64 Packages [1424 B]
2026-07-28T14:20:22.6658794Z Get:13 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages [1154 kB]
2026-07-28T14:20:22.6731187Z Get:14 http://azure.archive.ubuntu.com/ubuntu noble-updates/main Translation-en [278 kB]
2026-07-28T14:20:22.6816955Z Get:15 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 Components [180 kB]
2026-07-28T14:20:22.6839839Z Get:16 http://azure.archive.ubuntu.com/ubuntu noble-updates/universe amd64 Packages [1679 kB]
2026-07-28T14:20:22.6947242Z Get:17 http://azure.archive.ubuntu.com/ubuntu noble-updates/universe Translation-en [334 kB]
2026-07-28T14:20:22.6980664Z Get:18 http://azure.archive.ubuntu.com/ubuntu noble-updates/universe amd64 Components [389 kB]
2026-07-28T14:20:22.7015872Z Get:19 http://azure.archive.ubuntu.com/ubuntu noble-updates/restricted amd64 Packages [1367 kB]
2026-07-28T14:20:22.7129683Z Get:20 http://azure.archive.ubuntu.com/ubuntu noble-updates/restricted Translation-en [308 kB]
2026-07-28T14:20:22.7210975Z Get:21 http://azure.archive.ubuntu.com/ubuntu noble-updates/multiverse amd64 Packages [45.4 kB]
2026-07-28T14:20:22.7218912Z Get:22 http://azure.archive.ubuntu.com/ubuntu noble-updates/multiverse Translation-en [12.3 kB]
2026-07-28T14:20:22.7657748Z Get:23 http://azure.archive.ubuntu.com/ubuntu noble-updates/multiverse amd64 Components [940 B]
2026-07-28T14:20:22.7724794Z Get:24 http://azure.archive.ubuntu.com/ubuntu noble-backports/main amd64 Components [5760 B]
2026-07-28T14:20:22.7726540Z Get:25 http://azure.archive.ubuntu.com/ubuntu noble-backports/universe amd64 Packages [32.5 kB]
2026-07-28T14:20:22.7727946Z Get:26 http://azure.archive.ubuntu.com/ubuntu noble-backports/universe amd64 Components [12.6 kB]
2026-07-28T14:20:22.7747715Z Get:27 http://azure.archive.ubuntu.com/ubuntu noble-security/main amd64 Packages [898 kB]
2026-07-28T14:20:22.7802258Z Get:28 http://azure.archive.ubuntu.com/ubuntu noble-security/main Translation-en [198 kB]
2026-07-28T14:20:22.7821465Z Get:29 http://azure.archive.ubuntu.com/ubuntu noble-security/main amd64 Components [46.3 kB]
2026-07-28T14:20:22.7839594Z Get:30 http://azure.archive.ubuntu.com/ubuntu noble-security/universe amd64 Packages [1199 kB]
2026-07-28T14:20:22.7916515Z Get:31 http://azure.archive.ubuntu.com/ubuntu noble-security/universe Translation-en [239 kB]
2026-07-28T14:20:22.7943821Z Get:32 http://azure.archive.ubuntu.com/ubuntu noble-security/universe amd64 Components [76.2 kB]
2026-07-28T14:20:22.7962391Z Get:33 http://azure.archive.ubuntu.com/ubuntu noble-security/restricted amd64 Packages [1273 kB]
2026-07-28T14:20:22.8055570Z Get:34 http://azure.archive.ubuntu.com/ubuntu noble-security/restricted Translation-en [290 kB]
2026-07-28T14:20:22.8116644Z Get:35 http://azure.archive.ubuntu.com/ubuntu noble-security/multiverse amd64 Packages [40.3 kB]
2026-07-28T14:20:22.8131993Z Get:36 http://azure.archive.ubuntu.com/ubuntu noble-security/multiverse Translation-en [10.6 kB]
2026-07-28T14:20:26.7404713Z Fetched 10.9 MB in 1s (8115 kB/s)
2026-07-28T14:20:27.4190040Z Reading package lists...
2026-07-28T14:20:27.4495316Z Reading package lists...
2026-07-28T14:20:27.5969185Z Building dependency tree...
2026-07-28T14:20:27.5976239Z Reading state information...
2026-07-28T14:20:27.7425217Z The following NEW packages will be installed:
2026-07-28T14:20:27.7426352Z   postgresql-client
2026-07-28T14:20:27.7593392Z 0 upgraded, 1 newly installed, 0 to remove and 73 not upgraded.
2026-07-28T14:20:27.7594361Z Need to get 11.6 kB of archives.
2026-07-28T14:20:27.7595484Z After this operation, 17.4 kB of additional disk space will be used.
2026-07-28T14:20:27.7596460Z Get:1 file:/etc/apt/apt-mirrors.txt Mirrorlist [144 B]
2026-07-28T14:20:27.7835943Z Get:2 http://azure.archive.ubuntu.com/ubuntu noble-updates/main amd64 postgresql-client all 16+257build1.1 [11.6 kB]
2026-07-28T14:20:28.0244888Z Fetched 11.6 kB in 0s (325 kB/s)
2026-07-28T14:20:28.0467245Z Selecting previously unselected package postgresql-client.
2026-07-28T14:20:28.0777472Z (Reading database ... 
2026-07-28T14:20:28.0778239Z (Reading database ... 5%
2026-07-28T14:20:28.0778720Z (Reading database ... 10%
2026-07-28T14:20:28.0779038Z (Reading database ... 15%
2026-07-28T14:20:28.0779325Z (Reading database ... 20%
2026-07-28T14:20:28.0779583Z (Reading database ... 25%
2026-07-28T14:20:28.0779853Z (Reading database ... 30%
2026-07-28T14:20:28.0780150Z (Reading database ... 35%
2026-07-28T14:20:28.0780413Z (Reading database ... 40%
2026-07-28T14:20:28.0780764Z (Reading database ... 45%
2026-07-28T14:20:28.0781389Z (Reading database ... 50%
2026-07-28T14:20:28.0842515Z (Reading database ... 55%
2026-07-28T14:20:28.1852542Z (Reading database ... 60%
2026-07-28T14:20:28.3949013Z (Reading database ... 65%
2026-07-28T14:20:28.5628614Z (Reading database ... 70%
2026-07-28T14:20:28.6923116Z (Reading database ... 75%
2026-07-28T14:20:28.8561688Z (Reading database ... 80%
2026-07-28T14:20:29.0550411Z (Reading database ... 85%
2026-07-28T14:20:29.1704537Z (Reading database ... 90%
2026-07-28T14:20:29.2988406Z (Reading database ... 95%
2026-07-28T14:20:29.2989073Z (Reading database ... 100%
2026-07-28T14:20:29.2989846Z (Reading database ... 202954 files and directories currently installed.)
2026-07-28T14:20:29.3030898Z Preparing to unpack .../postgresql-client_16+257build1.1_all.deb ...
2026-07-28T14:20:29.3059768Z Unpacking postgresql-client (16+257build1.1) ...
2026-07-28T14:20:29.3434604Z Setting up postgresql-client (16+257build1.1) ...
2026-07-28T14:20:29.9601450Z 
2026-07-28T14:20:29.9602002Z Running kernel seems to be up-to-date.
2026-07-28T14:20:29.9602461Z 
2026-07-28T14:20:29.9602669Z No services need to be restarted.
2026-07-28T14:20:29.9603020Z 
2026-07-28T14:20:29.9603234Z No containers need to be restarted.
2026-07-28T14:20:29.9603640Z 
2026-07-28T14:20:29.9603925Z No user sessions are running outdated binaries.
2026-07-28T14:20:29.9604809Z 
2026-07-28T14:20:29.9606434Z No VM guests are running outdated hypervisor (qemu) binaries on this host.
2026-07-28T14:20:30.7754312Z ##[group]Run pip install boto3==1.34.0 pydantic==2.5.0 pydantic-settings==2.1.0
2026-07-28T14:20:30.7755276Z [36;1mpip install boto3==1.34.0 pydantic==2.5.0 pydantic-settings==2.1.0[0m
2026-07-28T14:20:30.7755721Z [36;1mcd ingestion[0m
2026-07-28T14:20:30.7756004Z [36;1mpip install -r requirements.txt[0m
2026-07-28T14:20:30.7802076Z shell: /usr/bin/bash -e {0}
2026-07-28T14:20:30.7802362Z env:
2026-07-28T14:20:30.7802661Z   pythonLocation: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T14:20:30.7803140Z   PKG_CONFIG_PATH: /opt/hostedtoolcache/Python/3.11.15/x64/lib/pkgconfig
2026-07-28T14:20:30.7803594Z   Python_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T14:20:30.7804001Z   Python2_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T14:20:30.7804418Z   Python3_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T14:20:30.7804847Z   LD_LIBRARY_PATH: /opt/hostedtoolcache/Python/3.11.15/x64/lib
2026-07-28T14:20:30.7805492Z ##[endgroup]
2026-07-28T14:20:31.8031885Z Collecting boto3==1.34.0
2026-07-28T14:20:31.8551129Z   Downloading boto3-1.34.0-py3-none-any.whl.metadata (6.6 kB)
2026-07-28T14:20:31.9448091Z Collecting pydantic==2.5.0
2026-07-28T14:20:31.9500736Z   Downloading pydantic-2.5.0-py3-none-any.whl.metadata (174 kB)
2026-07-28T14:20:31.9936302Z Collecting pydantic-settings==2.1.0
2026-07-28T14:20:31.9981737Z   Downloading pydantic_settings-2.1.0-py3-none-any.whl.metadata (2.9 kB)
2026-07-28T14:20:32.2095356Z Collecting botocore<1.35.0,>=1.34.0 (from boto3==1.34.0)
2026-07-28T14:20:32.2135012Z   Downloading botocore-1.34.162-py3-none-any.whl.metadata (5.7 kB)
2026-07-28T14:20:32.2262391Z Collecting jmespath<2.0.0,>=0.7.1 (from boto3==1.34.0)
2026-07-28T14:20:32.2302845Z   Downloading jmespath-1.1.0-py3-none-any.whl.metadata (7.6 kB)
2026-07-28T14:20:32.2455545Z Collecting s3transfer<0.10.0,>=0.9.0 (from boto3==1.34.0)
2026-07-28T14:20:32.2503284Z   Downloading s3transfer-0.9.0-py3-none-any.whl.metadata (1.7 kB)
2026-07-28T14:20:32.2612303Z Collecting annotated-types>=0.4.0 (from pydantic==2.5.0)
2026-07-28T14:20:32.2651865Z   Downloading annotated_types-0.8.0-py3-none-any.whl.metadata (15 kB)
2026-07-28T14:20:32.8811531Z Collecting pydantic-core==2.14.1 (from pydantic==2.5.0)
2026-07-28T14:20:32.8885302Z   Downloading pydantic_core-2.14.1-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (6.5 kB)
2026-07-28T14:20:32.9054037Z Collecting typing-extensions>=4.6.1 (from pydantic==2.5.0)
2026-07-28T14:20:32.9087662Z   Downloading typing_extensions-4.16.0-py3-none-any.whl.metadata (3.3 kB)
2026-07-28T14:20:32.9238542Z Collecting python-dotenv>=0.21.0 (from pydantic-settings==2.1.0)
2026-07-28T14:20:32.9273641Z   Downloading python_dotenv-1.2.2-py3-none-any.whl.metadata (27 kB)
2026-07-28T14:20:32.9436853Z Collecting python-dateutil<3.0.0,>=2.1 (from botocore<1.35.0,>=1.34.0->boto3==1.34.0)
2026-07-28T14:20:32.9471842Z   Downloading python_dateutil-2.9.0.post0-py2.py3-none-any.whl.metadata (8.4 kB)
2026-07-28T14:20:32.9682346Z Collecting urllib3!=2.2.0,<3,>=1.25.4 (from botocore<1.35.0,>=1.34.0->boto3==1.34.0)
2026-07-28T14:20:32.9725794Z   Downloading urllib3-2.7.0-py3-none-any.whl.metadata (6.9 kB)
2026-07-28T14:20:32.9871238Z Collecting six>=1.5 (from python-dateutil<3.0.0,>=2.1->botocore<1.35.0,>=1.34.0->boto3==1.34.0)
2026-07-28T14:20:32.9930251Z   Downloading six-1.17.0-py2.py3-none-any.whl.metadata (1.7 kB)
2026-07-28T14:20:33.0227617Z Downloading boto3-1.34.0-py3-none-any.whl (139 kB)
2026-07-28T14:20:33.0300933Z Downloading pydantic-2.5.0-py3-none-any.whl (407 kB)
2026-07-28T14:20:33.0587671Z Downloading pydantic_settings-2.1.0-py3-none-any.whl (11 kB)
2026-07-28T14:20:33.0668808Z Downloading pydantic_core-2.14.1-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (2.1 MB)
2026-07-28T14:20:33.1042340Z    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 2.1/2.1 MB 79.4 MB/s  0:00:00
2026-07-28T14:20:33.1086659Z Downloading botocore-1.34.162-py3-none-any.whl (12.5 MB)
2026-07-28T14:20:33.1983258Z    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 12.5/12.5 MB 193.0 MB/s  0:00:00
2026-07-28T14:20:33.2019827Z Downloading jmespath-1.1.0-py3-none-any.whl (20 kB)
2026-07-28T14:20:33.2078040Z Downloading python_dateutil-2.9.0.post0-py2.py3-none-any.whl (229 kB)
2026-07-28T14:20:33.2156301Z Downloading s3transfer-0.9.0-py3-none-any.whl (82 kB)
2026-07-28T14:20:33.2215949Z Downloading urllib3-2.7.0-py3-none-any.whl (131 kB)
2026-07-28T14:20:33.2272204Z Downloading annotated_types-0.8.0-py3-none-any.whl (13 kB)
2026-07-28T14:20:33.2332551Z Downloading python_dotenv-1.2.2-py3-none-any.whl (22 kB)
2026-07-28T14:20:33.2394031Z Downloading six-1.17.0-py2.py3-none-any.whl (11 kB)
2026-07-28T14:20:33.2451421Z Downloading typing_extensions-4.16.0-py3-none-any.whl (45 kB)
2026-07-28T14:20:33.3165829Z Installing collected packages: urllib3, typing-extensions, six, python-dotenv, jmespath, annotated-types, python-dateutil, pydantic-core, pydantic, botocore, s3transfer, pydantic-settings, boto3
2026-07-28T14:20:34.3153747Z 
2026-07-28T14:20:34.3167321Z Successfully installed annotated-types-0.8.0 boto3-1.34.0 botocore-1.34.162 jmespath-1.1.0 pydantic-2.5.0 pydantic-core-2.14.1 pydantic-settings-2.1.0 python-dateutil-2.9.0.post0 python-dotenv-1.2.2 s3transfer-0.9.0 six-1.17.0 typing-extensions-4.16.0 urllib3-2.7.0
2026-07-28T14:20:34.7976236Z Collecting requests==2.31.0 (from -r requirements.txt (line 1))
2026-07-28T14:20:34.8469976Z   Downloading requests-2.31.0-py3-none-any.whl.metadata (4.6 kB)
2026-07-28T14:20:35.0961446Z Collecting sqlalchemy==2.0.23 (from -r requirements.txt (line 2))
2026-07-28T14:20:35.1003454Z   Downloading SQLAlchemy-2.0.23-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (9.6 kB)
2026-07-28T14:20:35.1574529Z Collecting psycopg2-binary==2.9.9 (from -r requirements.txt (line 3))
2026-07-28T14:20:35.1643916Z   Downloading psycopg2_binary-2.9.9-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (4.4 kB)
2026-07-28T14:20:35.1784269Z Collecting python-dotenv==1.0.0 (from -r requirements.txt (line 4))
2026-07-28T14:20:35.1877476Z   Downloading python_dotenv-1.0.0-py3-none-any.whl.metadata (21 kB)
2026-07-28T14:20:35.2061143Z Collecting geoalchemy2==0.14.2 (from -r requirements.txt (line 5))
2026-07-28T14:20:35.2108835Z   Downloading GeoAlchemy2-0.14.2-py3-none-any.whl.metadata (1.9 kB)
2026-07-28T14:20:35.2142427Z Requirement already satisfied: pydantic==2.5.0 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from -r requirements.txt (line 6)) (2.5.0)
2026-07-28T14:20:35.2146730Z Requirement already satisfied: pydantic-settings==2.1.0 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from -r requirements.txt (line 7)) (2.1.0)
2026-07-28T14:20:35.2150481Z Requirement already satisfied: boto3==1.34.0 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from -r requirements.txt (line 8)) (1.34.0)
2026-07-28T14:20:35.2425823Z Collecting pytz==2023.3 (from -r requirements.txt (line 9))
2026-07-28T14:20:35.2479236Z   Downloading pytz-2023.3-py2.py3-none-any.whl.metadata (22 kB)
2026-07-28T14:20:35.3357482Z Collecting charset-normalizer<4,>=2 (from requests==2.31.0->-r requirements.txt (line 1))
2026-07-28T14:20:35.3396572Z   Downloading charset_normalizer-3.4.9-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (41 kB)
2026-07-28T14:20:35.3570185Z Collecting idna<4,>=2.5 (from requests==2.31.0->-r requirements.txt (line 1))
2026-07-28T14:20:35.3612349Z   Downloading idna-3.18-py3-none-any.whl.metadata (6.1 kB)
2026-07-28T14:20:35.3655855Z Requirement already satisfied: urllib3<3,>=1.21.1 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from requests==2.31.0->-r requirements.txt (line 1)) (2.7.0)
2026-07-28T14:20:35.3795433Z Collecting certifi>=2017.4.17 (from requests==2.31.0->-r requirements.txt (line 1))
2026-07-28T14:20:35.3831465Z   Downloading certifi-2026.7.22-py3-none-any.whl.metadata (2.5 kB)
2026-07-28T14:20:35.3871490Z Requirement already satisfied: typing-extensions>=4.2.0 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from sqlalchemy==2.0.23->-r requirements.txt (line 2)) (4.16.0)
2026-07-28T14:20:35.5159349Z Collecting greenlet!=0.4.17 (from sqlalchemy==2.0.23->-r requirements.txt (line 2))
2026-07-28T14:20:35.5207789Z   Downloading greenlet-3.5.4-cp311-cp311-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl.metadata (3.8 kB)
2026-07-28T14:20:35.5392254Z Collecting packaging (from geoalchemy2==0.14.2->-r requirements.txt (line 5))
2026-07-28T14:20:35.5431256Z   Downloading packaging-26.2-py3-none-any.whl.metadata (3.5 kB)
2026-07-28T14:20:35.5483041Z Requirement already satisfied: annotated-types>=0.4.0 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from pydantic==2.5.0->-r requirements.txt (line 6)) (0.8.0)
2026-07-28T14:20:35.5488899Z Requirement already satisfied: pydantic-core==2.14.1 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from pydantic==2.5.0->-r requirements.txt (line 6)) (2.14.1)
2026-07-28T14:20:35.5513380Z Requirement already satisfied: botocore<1.35.0,>=1.34.0 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from boto3==1.34.0->-r requirements.txt (line 8)) (1.34.162)
2026-07-28T14:20:35.5519401Z Requirement already satisfied: jmespath<2.0.0,>=0.7.1 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from boto3==1.34.0->-r requirements.txt (line 8)) (1.1.0)
2026-07-28T14:20:35.5525227Z Requirement already satisfied: s3transfer<0.10.0,>=0.9.0 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from boto3==1.34.0->-r requirements.txt (line 8)) (0.9.0)
2026-07-28T14:20:35.5546723Z Requirement already satisfied: python-dateutil<3.0.0,>=2.1 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from botocore<1.35.0,>=1.34.0->boto3==1.34.0->-r requirements.txt (line 8)) (2.9.0.post0)
2026-07-28T14:20:35.5578497Z Requirement already satisfied: six>=1.5 in /opt/hostedtoolcache/Python/3.11.15/x64/lib/python3.11/site-packages (from python-dateutil<3.0.0,>=2.1->botocore<1.35.0,>=1.34.0->boto3==1.34.0->-r requirements.txt (line 8)) (1.17.0)
2026-07-28T14:20:35.5711109Z Downloading requests-2.31.0-py3-none-any.whl (62 kB)
2026-07-28T14:20:35.5793827Z Downloading SQLAlchemy-2.0.23-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (3.2 MB)
2026-07-28T14:20:35.6184356Z    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3.2/3.2 MB 94.2 MB/s  0:00:00
2026-07-28T14:20:35.6223154Z Downloading psycopg2_binary-2.9.9-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (3.0 MB)
2026-07-28T14:20:35.6360213Z    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3.0/3.0 MB 238.1 MB/s  0:00:00
2026-07-28T14:20:35.6395714Z Downloading python_dotenv-1.0.0-py3-none-any.whl (19 kB)
2026-07-28T14:20:35.6460879Z Downloading GeoAlchemy2-0.14.2-py3-none-any.whl (72 kB)
2026-07-28T14:20:35.6569660Z Downloading pytz-2023.3-py2.py3-none-any.whl (502 kB)
2026-07-28T14:20:35.6648825Z Downloading charset_normalizer-3.4.9-cp311-cp311-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl (221 kB)
2026-07-28T14:20:35.6719681Z Downloading idna-3.18-py3-none-any.whl (65 kB)
2026-07-28T14:20:35.6781950Z Downloading certifi-2026.7.22-py3-none-any.whl (136 kB)
2026-07-28T14:20:35.6840147Z Downloading greenlet-3.5.4-cp311-cp311-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl (624 kB)
2026-07-28T14:20:35.6890764Z    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 624.7/624.7 kB 123.3 MB/s  0:00:00
2026-07-28T14:20:35.6930953Z Downloading packaging-26.2-py3-none-any.whl (100 kB)
2026-07-28T14:20:35.7426756Z Installing collected packages: pytz, python-dotenv, psycopg2-binary, packaging, idna, greenlet, charset-normalizer, certifi, sqlalchemy, requests, geoalchemy2
2026-07-28T14:20:35.8346114Z   Attempting uninstall: python-dotenv
2026-07-28T14:20:35.8369166Z     Found existing installation: python-dotenv 1.2.2
2026-07-28T14:20:35.8396178Z     Uninstalling python-dotenv-1.2.2:
2026-07-28T14:20:35.8406586Z       Successfully uninstalled python-dotenv-1.2.2
2026-07-28T14:20:37.1079074Z 
2026-07-28T14:20:37.1095099Z Successfully installed certifi-2026.7.22 charset-normalizer-3.4.9 geoalchemy2-0.14.2 greenlet-3.5.4 idna-3.18 packaging-26.2 psycopg2-binary-2.9.9 python-dotenv-1.0.0 pytz-2023.3 requests-2.31.0 sqlalchemy-2.0.23
2026-07-28T14:20:37.1762082Z ##[group]Run cd ingestion
2026-07-28T14:20:37.1762409Z [36;1mcd ingestion[0m
2026-07-28T14:20:37.1762770Z [36;1mpython run_ingestion.py --source all --period incremental[0m
2026-07-28T14:20:37.1807444Z shell: /usr/bin/bash -e {0}
2026-07-28T14:20:37.1807717Z env:
2026-07-28T14:20:37.1808011Z   pythonLocation: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T14:20:37.1808490Z   PKG_CONFIG_PATH: /opt/hostedtoolcache/Python/3.11.15/x64/lib/pkgconfig
2026-07-28T14:20:37.1808963Z   Python_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T14:20:37.1809385Z   Python2_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T14:20:37.1809784Z   Python3_ROOT_DIR: /opt/hostedtoolcache/Python/3.11.15/x64
2026-07-28T14:20:37.1810191Z   LD_LIBRARY_PATH: /opt/hostedtoolcache/Python/3.11.15/x64/lib
2026-07-28T14:20:37.1810524Z   ENV: staging
2026-07-28T14:20:37.1810754Z   AWS_REGION: ap-southeast-2
2026-07-28T14:20:37.1811157Z   AWS_ACCESS_KEY_ID: ***
2026-07-28T14:20:37.1811554Z   AWS_SECRET_ACCESS_KEY: ***
2026-07-28T14:20:37.1811835Z   HARVEST_API_KEY: ***
2026-07-28T14:20:37.1812126Z   SECRET_KEY: ***

2026-07-28T14:20:37.1812406Z   VITE_API_URL: ***
2026-07-28T14:20:37.1812637Z   RDS_USER: ***
2026-07-28T14:20:37.1812873Z   RDS_PASSWORD: ***
2026-07-28T14:20:37.1813233Z   RDS_ENDPOINT: ***
2026-07-28T14:20:37.1813443Z   RDS_PORT: 5432
2026-07-28T14:20:37.1813668Z   RDS_DATABASE: auxein_db
2026-07-28T14:20:37.1813911Z ##[endgroup]
2026-07-28T14:20:38.2107645Z   RDS_SECRET_NAME not set, trying environment variables
2026-07-28T14:20:38.2108336Z   Using RDS database from environment variables (ENV=staging)
2026-07-28T14:37:11.7732279Z 
2026-07-28T14:37:11.7732877Z ======================================================================
2026-07-28T14:37:11.7733614Z   WEATHER DATA INGESTION
2026-07-28T14:37:11.7734082Z   Started: 2026-07-28 14:20:38.217746
2026-07-28T14:37:11.7734555Z   Source: ALL
2026-07-28T14:37:11.7735200Z   Period: INCREMENTAL
2026-07-28T14:37:11.7735896Z ======================================================================
2026-07-28T14:37:11.7736304Z 
2026-07-28T14:37:11.7736789Z ▶ Starting HARVEST ingestion...
2026-07-28T14:37:11.7737114Z 
2026-07-28T14:37:11.7737121Z 
2026-07-28T14:37:11.7737332Z ============================================================
2026-07-28T14:37:11.7737979Z Starting Harvest ingestion at 2026-07-28 14:20:38.217818
2026-07-28T14:37:11.7738603Z ============================================================
2026-07-28T14:37:11.7738978Z 
2026-07-28T14:37:11.7739171Z Found 43 active Harvest stations
2026-07-28T14:37:11.7740056Z 
2026-07-28T14:37:11.7740294Z Resolved 2/2 credential ref(s) across 43 stations
2026-07-28T14:37:11.7740711Z 
2026-07-28T14:37:11.7740908Z Processing: HARV_BARBOUR_01_HUMIDITY
2026-07-28T14:37:11.7741455Z     Fetching trace 359406: 2026-07-27 to 2026-07-28
2026-07-28T14:37:11.7742042Z       Page 1: 200 records (fetching more...)
2026-07-28T14:37:11.7742603Z       Page 2: 200 records (fetching more...)
2026-07-28T14:37:11.7743175Z       Page 3: 200 records (fetching more...)
2026-07-28T14:37:11.7743716Z       Page 4: 200 records (fetching more...)
2026-07-28T14:37:11.7744240Z       Page 5: 199 records (fetching more...)
2026-07-28T14:37:11.7744772Z       Page 6: 200 records (fetching more...)
2026-07-28T14:37:11.7745588Z       Page 7: 200 records (fetching more...)
2026-07-28T14:37:11.7746171Z     Received 1462 total records across 8 page(s)
2026-07-28T14:37:11.7746837Z   ✓ Inserted 1462 records
2026-07-28T14:37:11.7747288Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T14:37:11.7747624Z 
2026-07-28T14:37:11.7747809Z Processing: HARV_BARBOUR_01_PRECIP
2026-07-28T14:37:11.7748342Z     Fetching trace 321175: 2026-07-27 to 2026-07-28
2026-07-28T14:37:11.7748917Z       Page 1: 200 records (fetching more...)
2026-07-28T14:37:11.7749331Z       Page 2: 200 records (fetching more...)
2026-07-28T14:37:11.7749656Z       Page 3: 200 records (fetching more...)
2026-07-28T14:37:11.7750333Z       Page 4: 200 records (fetching more...)
2026-07-28T14:37:11.7750908Z       Page 5: 200 records (fetching more...)
2026-07-28T14:37:11.7751238Z       Page 6: 200 records (fetching more...)
2026-07-28T14:37:11.7751743Z       Page 7: 200 records (fetching more...)
2026-07-28T14:37:11.7752346Z     Received 1468 total records across 8 page(s)
2026-07-28T14:37:11.7753002Z   ✓ Inserted 1468 records
2026-07-28T14:37:11.7753484Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T14:37:11.7753807Z 
2026-07-28T14:37:11.7754019Z Processing: HARV_BARBOUR_01_RADIATION
2026-07-28T14:37:11.7754383Z     Fetching trace 359409: 2026-07-27 to 2026-07-28
2026-07-28T14:37:11.7754723Z       Page 1: 200 records (fetching more...)
2026-07-28T14:37:11.7755311Z       Page 2: 200 records (fetching more...)
2026-07-28T14:37:11.7755619Z       Page 3: 200 records (fetching more...)
2026-07-28T14:37:11.7755923Z       Page 4: 200 records (fetching more...)
2026-07-28T14:37:11.7756218Z       Page 5: 200 records (fetching more...)
2026-07-28T14:37:11.7756528Z       Page 6: 200 records (fetching more...)
2026-07-28T14:37:11.7756818Z       Page 7: 200 records (fetching more...)
2026-07-28T14:37:11.7757131Z     Received 1473 total records across 8 page(s)
2026-07-28T14:37:11.7757500Z   ✓ Inserted 1473 records
2026-07-28T14:37:11.7757758Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T14:37:11.7757941Z 
2026-07-28T14:37:11.7758048Z Processing: HARV_BARBOUR_01_TEMP
2026-07-28T14:37:11.7758436Z   ✓ Already up to date (last: 2026-07-28 07:50:00+00:00)
2026-07-28T14:37:11.7758676Z 
2026-07-28T14:37:11.7758787Z Processing: HARV_BARBOUR_02_TEMP
2026-07-28T14:37:11.7759153Z   ✓ Already up to date (last: 2026-07-28 02:00:00+00:00)
2026-07-28T14:37:11.7759376Z 
2026-07-28T14:37:11.7759480Z Processing: HARV_BARBOUR_03_TEMP
2026-07-28T14:37:11.7759818Z   ✓ Already up to date (last: 2026-07-28 07:51:00+00:00)
2026-07-28T14:37:11.7760033Z 
2026-07-28T14:37:11.7760141Z Processing: HARV_BLACK_01_TEMP
2026-07-28T14:37:11.7760476Z   ✓ Already up to date (last: 2026-07-28 07:50:00+00:00)
2026-07-28T14:37:11.7760699Z 
2026-07-28T14:37:11.7760806Z Processing: HARV_BLACK_02_TEMP
2026-07-28T14:37:11.7761091Z     Fetching trace 16116: 2026-04-25 to 2026-07-28
2026-07-28T14:37:11.7761409Z       Page 1: 1 records (fetching more...)
2026-07-28T14:37:11.7761710Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7761993Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7762289Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7762567Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7762851Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7763318Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7763623Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7763995Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7764273Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7764556Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7764836Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7765401Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7765693Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7765983Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7766263Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7766547Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7766829Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7767108Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7767397Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7767703Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7768001Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7768472Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7769005Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7769491Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7770000Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7770676Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7771203Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7771708Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7772197Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7772695Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7773190Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7773711Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7774220Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7774691Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7775476Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7775986Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7776483Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7776974Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7777484Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7777993Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7778492Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7778993Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7779491Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7779996Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7780501Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7781002Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7781502Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7781999Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7782512Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7783007Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7783513Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7784014Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7784510Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7785255Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7785776Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7786284Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7786784Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7787295Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7787801Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7788294Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7788793Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7789294Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7790011Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7790513Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7791018Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7791517Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7792017Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7792531Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7793031Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7793530Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7794034Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7794536Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7795320Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7795832Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7796342Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7796844Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7797355Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7797869Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7798364Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7798871Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7799366Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7799875Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7800555Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7801079Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7801576Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7802078Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7802584Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7803076Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7803578Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7804073Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7804581Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7805353Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7805854Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7806351Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7806859Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7807364Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7807881Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7808378Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7808880Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7809381Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7809886Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7810387Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7810890Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7811390Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7811885Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7812411Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7812899Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7813400Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7813893Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7814402Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7815116Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7815634Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7816139Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7816632Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7817139Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7817635Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7818138Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7818633Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7819134Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7819868Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7820361Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7820867Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7821370Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7821879Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7822390Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7822879Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7823368Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7823866Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7824368Z       Page 1: 0 records (fetching more...)
2026-07-28T14:37:11.7824879Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1263662Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1265545Z     Received 1 total records across 1 page(s)
2026-07-28T14:46:14.1266463Z   ✓ Inserted 1 records
2026-07-28T14:46:14.1266997Z   Time range: 2026-04-25 to 2026-04-25
2026-07-28T14:46:14.1267377Z 
2026-07-28T14:46:14.1267603Z Processing: HARV_BLACK_03_TEMP
2026-07-28T14:46:14.1268350Z   ✓ Already up to date (last: 2026-07-28 07:50:00+00:00)
2026-07-28T14:46:14.1268838Z 
2026-07-28T14:46:14.1269050Z Processing: HARV_BLACK_05_TEMP
2026-07-28T14:46:14.1269766Z   ✓ Already up to date (last: 2026-07-28 07:50:00+00:00)
2026-07-28T14:46:14.1270236Z 
2026-07-28T14:46:14.1270900Z Processing: HARV_BLACK_06_PRECIP
2026-07-28T14:46:14.1271515Z     Fetching trace 16121: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1272192Z       Page 1: 200 records (fetching more...)
2026-07-28T14:46:14.1272854Z     Received 319 total records across 2 page(s)
2026-07-28T14:46:14.1273543Z   ✓ Inserted 319 records
2026-07-28T14:46:14.1273997Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1274335Z 
2026-07-28T14:46:14.1274527Z Processing: HARV_CODC_ALEX_HUMIDITY
2026-07-28T14:46:14.1275330Z     Fetching trace 60325: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1275945Z       Page 1: 200 records (fetching more...)
2026-07-28T14:46:14.1276511Z     Received 210 total records across 2 page(s)
2026-07-28T14:46:14.1277170Z   ✓ Inserted 210 records
2026-07-28T14:46:14.1277601Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1277921Z 
2026-07-28T14:46:14.1278100Z Processing: HARV_CODC_ALEX_PRECIP
2026-07-28T14:46:14.1278608Z     Fetching trace 60326: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1279160Z       Page 1: 200 records (fetching more...)
2026-07-28T14:46:14.1279703Z     Received 210 total records across 2 page(s)
2026-07-28T14:46:14.1280287Z   ✓ Inserted 210 records
2026-07-28T14:46:14.1280710Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1281007Z 
2026-07-28T14:46:14.1281187Z Processing: HARV_CODC_ALEX_RADIATION
2026-07-28T14:46:14.1281690Z     Fetching trace 60330: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1282268Z       Page 1: 200 records (fetching more...)
2026-07-28T14:46:14.1282849Z     Received 210 total records across 2 page(s)
2026-07-28T14:46:14.1283507Z   ✓ Inserted 210 records
2026-07-28T14:46:14.1283897Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1284093Z 
2026-07-28T14:46:14.1284204Z Processing: HARV_CODC_ALEX_TEMP
2026-07-28T14:46:14.1284585Z   ✓ Already up to date (last: 2026-07-28 02:10:00+00:00)
2026-07-28T14:46:14.1284821Z 
2026-07-28T14:46:14.1285220Z Processing: HARV_CODC_CROM_HUMIDITY
2026-07-28T14:46:14.1285704Z     Fetching trace 60296: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1286133Z       Page 1: 200 records (fetching more...)
2026-07-28T14:46:14.1286714Z     Received 210 total records across 2 page(s)
2026-07-28T14:46:14.1287160Z   ✓ Inserted 210 records
2026-07-28T14:46:14.1287667Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1287901Z 
2026-07-28T14:46:14.1342972Z Processing: HARV_CODC_CROM_PRECIP
2026-07-28T14:46:14.1343607Z     Fetching trace 60297: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1344213Z       Page 1: 200 records (fetching more...)
2026-07-28T14:46:14.1345442Z     Received 210 total records across 2 page(s)
2026-07-28T14:46:14.1346134Z   ✓ Inserted 210 records
2026-07-28T14:46:14.1346584Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1346948Z 
2026-07-28T14:46:14.1347145Z Processing: HARV_CODC_CROM_RADIATION
2026-07-28T14:46:14.1347674Z     Fetching trace 60301: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1348249Z       Page 1: 200 records (fetching more...)
2026-07-28T14:46:14.1348808Z     Received 210 total records across 2 page(s)
2026-07-28T14:46:14.1349405Z   ✓ Inserted 210 records
2026-07-28T14:46:14.1349838Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1350162Z 
2026-07-28T14:46:14.1350337Z Processing: HARV_CODC_CROM_TEMP
2026-07-28T14:46:14.1350978Z   ✓ Already up to date (last: 2026-07-28 07:50:00+00:00)
2026-07-28T14:46:14.1351399Z 
2026-07-28T14:46:14.1351580Z Processing: HARV_CODC_ROXB_HUMIDITY
2026-07-28T14:46:14.1352113Z     Fetching trace 60197: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1352687Z       Page 1: 200 records (fetching more...)
2026-07-28T14:46:14.1353237Z     Received 210 total records across 2 page(s)
2026-07-28T14:46:14.1353835Z   ✓ Inserted 210 records
2026-07-28T14:46:14.1354256Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1354584Z 
2026-07-28T14:46:14.1354765Z Processing: HARV_CODC_ROXB_PRECIP
2026-07-28T14:46:14.1355525Z     Fetching trace 60198: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1356350Z       Page 1: 200 records (fetching more...)
2026-07-28T14:46:14.1356950Z     Received 210 total records across 2 page(s)
2026-07-28T14:46:14.1357570Z   ✓ Inserted 210 records
2026-07-28T14:46:14.1357994Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1358324Z 
2026-07-28T14:46:14.1358512Z Processing: HARV_CODC_ROXB_RADIATION
2026-07-28T14:46:14.1359041Z     Fetching trace 60202: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1359605Z       Page 1: 200 records (fetching more...)
2026-07-28T14:46:14.1360154Z     Received 210 total records across 2 page(s)
2026-07-28T14:46:14.1360753Z   ✓ Inserted 210 records
2026-07-28T14:46:14.1361177Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T14:46:14.1361499Z 
2026-07-28T14:46:14.1361676Z Processing: HARV_CODC_ROXB_TEMP
2026-07-28T14:46:14.1362331Z   ✓ Already up to date (last: 2026-07-28 07:50:00+00:00)
2026-07-28T14:46:14.1362733Z 
2026-07-28T14:46:14.1362914Z Processing: HARV_GREYSTONE_01_TEMP
2026-07-28T14:46:14.1363577Z   ✓ Already up to date (last: 2026-07-28 07:49:00+00:00)
2026-07-28T14:46:14.1363981Z 
2026-07-28T14:46:14.1364167Z Processing: HARV_GREYSTONE_02_TEMP
2026-07-28T14:46:14.1364797Z   ✓ Already up to date (last: 2026-07-28 08:00:00+00:00)
2026-07-28T14:46:14.1365429Z 
2026-07-28T14:46:14.1365617Z Processing: HARV_GREYSTONE_03_TEMP
2026-07-28T14:46:14.1366273Z   ✓ Already up to date (last: 2026-07-28 08:00:00+00:00)
2026-07-28T14:46:14.1366674Z 
2026-07-28T14:46:14.1366859Z Processing: HARV_GREYSTONE_04_TEMP
2026-07-28T14:46:14.1367500Z   ✓ Already up to date (last: 2026-07-28 08:01:00+00:00)
2026-07-28T14:46:14.1367903Z 
2026-07-28T14:46:14.1368083Z Processing: HARV_GREYSTONE_05_TEMP
2026-07-28T14:46:14.1368721Z   ✓ Already up to date (last: 2026-07-28 08:02:00+00:00)
2026-07-28T14:46:14.1369112Z 
2026-07-28T14:46:14.1369293Z Processing: HARV_GREYSTONE_06_TEMP
2026-07-28T14:46:14.1369828Z     Fetching trace 263565: 2026-02-03 to 2026-07-28
2026-07-28T14:46:14.1370381Z       Page 1: 1 records (fetching more...)
2026-07-28T14:46:14.1370940Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1371444Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1371956Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1372451Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1372958Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1373468Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1373970Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1374478Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1375464Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1375986Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1376483Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1376998Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1377505Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1377998Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1378501Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1379008Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1379514Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1380021Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1380521Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1381029Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1381534Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1382037Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1382537Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1383045Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1383552Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1384041Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1384546Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1385293Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1385985Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1386484Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1386998Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1387511Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1388003Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1388506Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1388998Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1389501Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1390010Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1390521Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1391018Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1391517Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1392010Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1392517Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1393055Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1393569Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1394066Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1394567Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1395311Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1395816Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1396316Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1396820Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1397321Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1397844Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1398333Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1398836Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1399340Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1399879Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1400395Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1400890Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1401405Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1401905Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1402410Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1402911Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1403416Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1403920Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1404429Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1405437Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1405939Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1406439Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1406931Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1407437Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1407935Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1408452Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1408943Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1409443Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1409944Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1410448Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1410946Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1411448Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1411947Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1412445Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1412954Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1413459Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1413959Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1414455Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1415228Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1416007Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1416532Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1417038Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1417550Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1418052Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1418544Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1419044Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1419540Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1420079Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1420598Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1421089Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1421587Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1422086Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1422586Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1423100Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1423597Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1424101Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1424602Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1425353Z       Page 1: 0 records (fetching more...)
2026-07-28T14:46:14.1425872Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0172138Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0172878Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0173581Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0174217Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0174725Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0175655Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0175979Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0176295Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0176601Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0176918Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0177221Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0177536Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0177839Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0178152Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0178454Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0178753Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0179084Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0179753Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0180055Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0180362Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0180665Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0180971Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0181431Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0181849Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0182157Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0182455Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0182770Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0183253Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0183779Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0184092Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0184394Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0184831Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0185560Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0185948Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0186464Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0186842Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0187149Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0187675Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0187985Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0188294Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0188600Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0188901Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0189206Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0189507Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0189811Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0190112Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0190423Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0190722Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0191029Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0191335Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0191636Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0191948Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0192249Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0192555Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0192856Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0193163Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0193472Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0193780Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0194087Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0194402Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0194715Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0195613Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0195919Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0196201Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0196599Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0196879Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0197170Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0197451Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0197732Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0198013Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0198300Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0198581Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0198866Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0199161Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0199606Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0199894Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0200176Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0200467Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0200752Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0201036Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0201325Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0201625Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0201916Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0202205Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0202486Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0202772Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0203059Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0203338Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0203630Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0203910Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0204196Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0204475Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0204766Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0205298Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0205726Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0206015Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0206301Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0206583Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0206861Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0207143Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0207425Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0207712Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0207992Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0208283Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0209007Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0209300Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0209580Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0209863Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0210148Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0210434Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0210719Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0211011Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0211295Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0211577Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0211861Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0212143Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0212427Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0212712Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0212995Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0213276Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0213562Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0213845Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0214127Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0214416Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0214693Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0215183Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0215467Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0215752Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0216028Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0216312Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0216592Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0217026Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0217308Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0217631Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0217912Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0218190Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0218473Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0218756Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0219040Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0219321Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0219603Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0219880Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0220165Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0220446Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0220731Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0221024Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0221304Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0221588Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0221869Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0222153Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0222433Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0222832Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0223121Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0223405Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0223683Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0223968Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0224243Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0224529Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0224815Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0225237Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0225524Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0225807Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0226089Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0226368Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0226654Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0226938Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0227222Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0227502Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0227789Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0228072Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0228349Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0228633Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0228914Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0229199Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0229483Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0229770Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0230048Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0230333Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0230610Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0230899Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0231180Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0231462Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0231748Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0232025Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0232309Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0232588Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0232873Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0233154Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0233573Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0233853Z       Page 1: 0 records (fetching more...)
2026-07-28T14:47:25.0234137Z       Page 1: 0 records (fetching more...)
2026-07-28T15:19:13.7883967Z       Page 1: 0 records (fetching more...)
2026-07-28T15:19:13.7884609Z       Page 1: 0 records (fetching more...)
2026-07-28T15:19:13.7885615Z       Page 1: 0 records (fetching more...)
2026-07-28T15:19:13.7886295Z       Page 1: 0 records (fetching more...)
2026-07-28T15:19:13.7886926Z       Page 1: 0 records (fetching more...)
2026-07-28T15:19:13.7887332Z     Received 1 total records across 1 page(s)
2026-07-28T15:19:13.7887948Z   ✓ Inserted 1 records
2026-07-28T15:19:13.7888259Z   Time range: 2026-02-03 to 2026-02-03
2026-07-28T15:19:13.7888514Z 
2026-07-28T15:19:13.7888668Z Processing: HARV_GREYSTONE_07_HUMIDITY
2026-07-28T15:19:13.7889064Z     Fetching trace 18535: 2026-07-27 to 2026-07-28
2026-07-28T15:19:13.7889485Z       Page 1: 199 records (fetching more...)
2026-07-28T15:19:13.7889893Z       Page 2: 200 records (fetching more...)
2026-07-28T15:19:13.7890268Z       Page 3: 200 records (fetching more...)
2026-07-28T15:19:13.7890648Z       Page 4: 200 records (fetching more...)
2026-07-28T15:19:13.7890965Z       Page 5: 200 records (fetching more...)
2026-07-28T15:19:13.7891281Z       Page 6: 200 records (fetching more...)
2026-07-28T15:19:13.7891967Z       Page 7: 200 records (fetching more...)
2026-07-28T15:19:13.7892311Z     Received 1448 total records across 8 page(s)
2026-07-28T15:19:13.7892671Z   ✓ Inserted 1448 records
2026-07-28T15:19:13.7892938Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T15:19:13.7893135Z 
2026-07-28T15:19:13.7893250Z Processing: HARV_GREYSTONE_07_PRECIP
2026-07-28T15:19:13.7893579Z     Fetching trace 266450: 2026-07-27 to 2026-07-28
2026-07-28T15:19:13.7893922Z       Page 1: 200 records (fetching more...)
2026-07-28T15:19:13.7894236Z       Page 2: 200 records (fetching more...)
2026-07-28T15:19:13.7894557Z       Page 3: 200 records (fetching more...)
2026-07-28T15:19:13.7894879Z       Page 4: 200 records (fetching more...)
2026-07-28T15:19:13.7895453Z       Page 5: 200 records (fetching more...)
2026-07-28T15:19:13.7895800Z       Page 6: 200 records (fetching more...)
2026-07-28T15:19:13.7896107Z       Page 7: 200 records (fetching more...)
2026-07-28T15:19:13.7896449Z     Received 1453 total records across 8 page(s)
2026-07-28T15:19:13.7896812Z   ✓ Inserted 1453 records
2026-07-28T15:19:13.7897077Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T15:19:13.7897271Z 
2026-07-28T15:19:13.7897473Z Processing: HARV_GREYSTONE_07_RADIATION
2026-07-28T15:19:13.7897867Z     Fetching trace 263560: 2026-07-27 to 2026-07-28
2026-07-28T15:19:13.7898205Z       Page 1: 200 records (fetching more...)
2026-07-28T15:19:13.7898542Z       Page 2: 200 records (fetching more...)
2026-07-28T15:19:13.7899070Z       Page 3: 200 records (fetching more...)
2026-07-28T15:19:13.7899390Z       Page 4: 200 records (fetching more...)
2026-07-28T15:19:13.7899713Z       Page 5: 200 records (fetching more...)
2026-07-28T15:19:13.7900179Z       Page 6: 200 records (fetching more...)
2026-07-28T15:19:13.7900716Z       Page 7: 200 records (fetching more...)
2026-07-28T15:19:13.7901064Z     Received 1458 total records across 8 page(s)
2026-07-28T15:19:13.7901645Z   ✓ Inserted 1458 records
2026-07-28T15:19:13.7901901Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T15:19:13.7902083Z 
2026-07-28T15:19:13.7902207Z Processing: HARV_MAORI_PT_01_HUMIDITY
2026-07-28T15:19:13.7902519Z     Fetching trace 34354: 2026-07-27 to 2026-07-28
2026-07-28T15:19:13.7902836Z       Page 1: 200 records (fetching more...)
2026-07-28T15:19:13.7903134Z       Page 2: 200 records (fetching more...)
2026-07-28T15:19:13.7903639Z     API error: HTTPSConnectionPool(host='live.harvest.com', port=443): Read timed out. (read timeout=30)
2026-07-28T15:19:13.7904172Z   ✗ Failed to fetch data
2026-07-28T15:19:13.7904324Z 
2026-07-28T15:19:13.7904433Z Processing: HARV_MAORI_PT_01_PRESSURE
2026-07-28T15:19:13.7905209Z     Fetching trace 316388: 2026-07-27 to 2026-07-28
2026-07-28T15:19:13.7905547Z       Page 1: 200 records (fetching more...)
2026-07-28T15:19:13.7905857Z       Page 2: 200 records (fetching more...)
2026-07-28T15:19:13.7906175Z     Received 401 total records across 3 page(s)
2026-07-28T15:19:13.7906517Z   ✓ Inserted 401 records
2026-07-28T15:19:13.7906768Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T15:19:13.7906957Z 
2026-07-28T15:19:13.7907070Z Processing: HARV_MAORI_PT_01_TEMP
2026-07-28T15:19:13.7907442Z   ✓ Already up to date (last: 2026-07-28 08:10:00+00:00)
2026-07-28T15:19:13.7907678Z 
2026-07-28T15:19:13.7907784Z Processing: HARV_MAORI_PT_02_TEMP
2026-07-28T15:19:13.7908143Z   ✓ Already up to date (last: 2026-07-28 08:10:00+00:00)
2026-07-28T15:19:13.7908363Z 
2026-07-28T15:19:13.7908475Z Processing: HARV_NETHERWOOD_01_HUMIDITY
2026-07-28T15:19:13.7908791Z     Fetching trace 18687: 2026-07-27 to 2026-07-28
2026-07-28T15:19:13.7909116Z       Page 1: 200 records (fetching more...)
2026-07-28T15:19:13.7909426Z       Page 2: 200 records (fetching more...)
2026-07-28T15:19:13.7909724Z       Page 3: 200 records (fetching more...)
2026-07-28T15:19:13.7910011Z       Page 4: 200 records (fetching more...)
2026-07-28T15:19:13.7910306Z       Page 5: 200 records (fetching more...)
2026-07-28T15:19:13.7910604Z       Page 6: 200 records (fetching more...)
2026-07-28T15:19:13.7911032Z       Page 7: 200 records (fetching more...)
2026-07-28T15:19:13.7911349Z     Received 1512 total records across 8 page(s)
2026-07-28T15:19:13.7911691Z   ✓ Inserted 1512 records
2026-07-28T15:19:13.7911937Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T15:19:13.7912117Z 
2026-07-28T15:19:13.7912236Z Processing: HARV_NETHERWOOD_01_PRECIP
2026-07-28T15:19:13.7912536Z     Fetching trace 18685: 2026-07-27 to 2026-07-28
2026-07-28T15:19:13.7912848Z       Page 1: 200 records (fetching more...)
2026-07-28T15:19:13.7913143Z       Page 2: 200 records (fetching more...)
2026-07-28T15:19:13.7913429Z       Page 3: 200 records (fetching more...)
2026-07-28T15:19:13.7913727Z       Page 4: 200 records (fetching more...)
2026-07-28T15:19:13.7914016Z       Page 5: 200 records (fetching more...)
2026-07-28T15:19:13.7914310Z       Page 6: 200 records (fetching more...)
2026-07-28T15:19:13.7914597Z       Page 7: 200 records (fetching more...)
2026-07-28T15:19:13.7915109Z     Received 1517 total records across 8 page(s)
2026-07-28T15:19:13.7915482Z   ✓ Inserted 1517 records
2026-07-28T15:19:13.7915735Z   Time range: 2026-07-27 to 2026-07-28
2026-07-28T15:19:13.7915917Z 
2026-07-28T15:19:13.7916028Z Processing: HARV_NETHERWOOD_01_TEMP
2026-07-28T15:19:13.7916388Z   ✓ Already up to date (last: 2026-07-28 02:30:00+00:00)
2026-07-28T15:19:13.7916611Z 
2026-07-28T15:19:13.7916718Z Processing: HARV_NETHERWOOD_02_TEMP
2026-07-28T15:19:13.7917067Z   ✓ Already up to date (last: 2026-07-28 08:21:00+00:00)
2026-07-28T15:19:13.7917289Z 
2026-07-28T15:19:13.7917396Z Processing: HARV_NETHERWOOD_03_TEMP
2026-07-28T15:19:13.7917742Z   ✓ Already up to date (last: 2026-07-28 08:22:00+00:00)
2026-07-28T15:19:13.7917966Z 
2026-07-28T15:19:13.7918073Z Processing: HARV_NETHERWOOD_04_TEMP
2026-07-28T15:19:13.7918418Z   ✓ Already up to date (last: 2026-07-28 08:22:00+00:00)
2026-07-28T15:19:13.7918637Z 
2026-07-28T15:19:13.7918743Z Processing: HARV_NETHERWOOD_05_TEMP
2026-07-28T15:19:13.7919095Z   ✓ Already up to date (last: 2026-07-28 02:30:00+00:00)
2026-07-28T15:19:13.7919307Z 
2026-07-28T15:19:13.7919437Z ============================================================
2026-07-28T15:19:13.7919785Z Harvest ingestion complete at 2026-07-28 15:15:42.830476
2026-07-28T15:19:13.7920118Z ============================================================
2026-07-28T15:19:13.7920322Z 
2026-07-28T15:19:13.7920470Z ✓ Harvest ingestion complete
2026-07-28T15:19:13.7920631Z 
2026-07-28T15:19:13.7920944Z   (note: credential session close raised: (psycopg2.OperationalError) SSL SYSCALL error: EOF detected
2026-07-28T15:19:13.7921357Z 
2026-07-28T15:19:13.7921554Z (Background on this error at: https://sqlalche.me/e/20/e3q8))
2026-07-28T15:19:13.7921966Z 
2026-07-28T15:19:13.7922113Z ▶ Starting ECAN ingestion...
2026-07-28T15:19:13.7922275Z 
2026-07-28T15:19:13.7922279Z 
2026-07-28T15:19:13.7922389Z ============================================================
2026-07-28T15:19:13.7922729Z Starting ECAN ingestion at 2026-07-28 15:15:42.841598
2026-07-28T15:19:13.7923039Z Period: 2_Days
2026-07-28T15:19:13.7923282Z ============================================================
2026-07-28T15:19:13.7923485Z 
2026-07-28T15:19:13.7923591Z Found 4 active ECAN sites
2026-07-28T15:19:13.7923740Z 
2026-07-28T15:19:13.7923847Z Processing: ECAN_HURUNUI_SH1
2026-07-28T15:19:13.7924146Z   ✓ rainfall: Inserted 48 records
2026-07-28T15:19:13.7924405Z   Total: 48/48 records
2026-07-28T15:19:13.7924545Z 
2026-07-28T15:19:13.7924649Z Processing: ECAN_LOWRY_HILLS
2026-07-28T15:19:13.7925196Z   ✓ rainfall: Inserted 48 records
2026-07-28T15:19:13.7925560Z   Total: 48/48 records
2026-07-28T15:19:13.7925704Z 
2026-07-28T15:19:13.7925820Z Processing: ECAN_PANNETS_ROAD
2026-07-28T15:19:13.7926139Z   ✓ rainfall: Inserted 47 records
2026-07-28T15:19:13.7926390Z   Total: 47/47 records
2026-07-28T15:19:13.7926527Z 
2026-07-28T15:19:13.7926629Z Processing: ECAN_WHITE_GORGE
2026-07-28T15:19:13.7926925Z   ✓ rainfall: Inserted 48 records
2026-07-28T15:19:13.7927176Z   Total: 48/48 records
2026-07-28T15:19:13.7927314Z 
2026-07-28T15:19:13.7927578Z ============================================================
2026-07-28T15:19:13.7927926Z ECAN ingestion complete at 2026-07-28 15:16:32.816640
2026-07-28T15:19:13.7928263Z ============================================================
2026-07-28T15:19:13.7928469Z 
2026-07-28T15:19:13.7928601Z ✓ ECAN ingestion complete
2026-07-28T15:19:13.7928758Z 
2026-07-28T15:19:13.7928892Z ▶ Starting MDC ingestion...
2026-07-28T15:19:13.7929050Z 
2026-07-28T15:19:13.7929055Z 
2026-07-28T15:19:13.7929165Z ============================================================
2026-07-28T15:19:13.7929491Z Starting MDC ingestion at 2026-07-28 15:16:32.816714
2026-07-28T15:19:13.7929813Z Period: incremental
2026-07-28T15:19:13.7930039Z Interval: 30 minutes
2026-07-28T15:19:13.7930282Z ============================================================
2026-07-28T15:19:13.7930484Z 
2026-07-28T15:19:13.7930594Z Found 52 active MDC station(s)
2026-07-28T15:19:13.7930759Z 
2026-07-28T15:19:13.7930868Z Processing: MDC_AWATERE_AT_AWAPIRI
2026-07-28T15:19:13.7931150Z   Site: Awatere at Awapiri
2026-07-28T15:19:13.7931522Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Direction']
2026-07-28T15:19:13.7931947Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T15:19:13.7932809Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20at%20Awapiri&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T15:19:13.7933672Z       ✓ 2026: inserted 97 records
2026-07-28T15:19:13.7933944Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T15:19:13.7934716Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20at%20Awapiri&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T15:19:13.7935833Z       ✓ 2026: inserted 97 records
2026-07-28T15:19:13.7936115Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T15:19:13.7936876Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20at%20Awapiri&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T15:19:13.7937671Z       ✓ 2026: inserted 97 records
2026-07-28T15:19:13.7937960Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T15:19:13.7938749Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20at%20Awapiri&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T15:19:13.7939540Z       2026: no records parsed
2026-07-28T15:19:13.7939795Z   Total inserted: 291 records
2026-07-28T15:19:13.7940199Z 
2026-07-28T15:19:13.7940309Z Processing: MDC_AWATERE_GLENBRAE
2026-07-28T15:19:13.7940583Z   Site: Awatere Glenbrae NRFA
2026-07-28T15:19:13.7941092Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature']
2026-07-28T15:19:13.7941666Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T15:19:13.7942496Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20Glenbrae%20NRFA&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T15:19:13.7943339Z       ✓ 2026: inserted 97 records
2026-07-28T15:19:13.7943603Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T15:19:13.7944362Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20Glenbrae%20NRFA&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T15:19:13.7945413Z       ✓ 2026: inserted 97 records
2026-07-28T15:19:13.7945689Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T15:19:13.7946447Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20Glenbrae%20NRFA&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T15:19:13.7947245Z       ✓ 2026: inserted 97 records
2026-07-28T15:19:13.7947512Z     Wind Speed: 2026-07-27 to 2026-07-29
2026-07-28T15:19:13.7948415Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20Glenbrae%20NRFA&Measurement=Wind%20Speed&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T15:19:13.7949257Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4612330Z     Wind Gust: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4613726Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20Glenbrae%20NRFA&Measurement=Wind%20Gust&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4615624Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4616051Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4617147Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20Glenbrae%20NRFA&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4618130Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4618462Z     Soil Temperature: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4619421Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20Glenbrae%20NRFA&Measurement=Soil%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4620402Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4620699Z   Total inserted: 679 records
2026-07-28T16:03:45.4620888Z 
2026-07-28T16:03:45.4621044Z Processing: MDC_AWATERE_RIVER_AT_AWAPIRI
2026-07-28T16:03:45.4621382Z   Site: Awatere River at Awapiri
2026-07-28T16:03:45.4621784Z   Measurements: ['Air Temperature', 'Humidity', 'Wind Direction']
2026-07-28T16:03:45.4622239Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4623204Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20River%20at%20Awapiri&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4624164Z       2026: no records parsed
2026-07-28T16:03:45.4624464Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4625595Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20River%20at%20Awapiri&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4626526Z       2026: no records parsed
2026-07-28T16:03:45.4626830Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4627708Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Awatere%20River%20at%20Awapiri&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4628937Z       2026: no records parsed
2026-07-28T16:03:45.4629194Z   Total inserted: 0 records
2026-07-28T16:03:45.4629353Z 
2026-07-28T16:03:45.4629458Z Processing: MDC_BLENHEIM_BOWLING
2026-07-28T16:03:45.4629732Z   Site: Blenheim Bowling Club
2026-07-28T16:03:45.4630231Z   Measurements: ['Air Temperature', 'Humidity', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Barometric Pressure hPa']
2026-07-28T16:03:45.4630779Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4631607Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20Bowling%20Club&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4632478Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4632754Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4633520Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20Bowling%20Club&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4634339Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4634603Z     Wind Speed: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4635679Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20Bowling%20Club&Measurement=Wind%20Speed&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4636521Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4636786Z     Wind Gust: 2024-12-31 to 2026-07-29
2026-07-28T16:03:45.4637559Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20Bowling%20Club&Measurement=Wind%20Gust&From=31/12/2024&To=01/01/2025&Interval=30%20minutes
2026-07-28T16:03:45.4638360Z       ✓ 2024: inserted 49 records
2026-07-28T16:03:45.4639099Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20Bowling%20Club&Measurement=Wind%20Gust&From=01/01/2025&To=01/01/2026&Interval=30%20minutes
2026-07-28T16:03:45.4639917Z       ✓ 2025: inserted 11113 records
2026-07-28T16:03:45.4640665Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20Bowling%20Club&Measurement=Wind%20Gust&From=01/01/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4641439Z       2026: no records parsed
2026-07-28T16:03:45.4641714Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4642511Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20Bowling%20Club&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4643331Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4643639Z     Barometric Pressure hPa: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4644521Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20Bowling%20Club&Measurement=Barometric%20Pressure%20hPa&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4645509Z       2026: no records parsed
2026-07-28T16:03:45.4645772Z   Total inserted: 11550 records
2026-07-28T16:03:45.4645938Z 
2026-07-28T16:03:45.4646040Z Processing: MDC_BLENHEIM_OFFICE
2026-07-28T16:03:45.4646320Z   Site: Blenheim at MDC Office
2026-07-28T16:03:45.4646690Z   Measurements: ['Air Temperature', 'Rainfall', 'Barometric Pressure hPa']
2026-07-28T16:03:45.4647111Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4647945Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20at%20MDC%20Office&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4648811Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4649083Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4649846Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20at%20MDC%20Office&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4650798Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4651093Z     Barometric Pressure hPa: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4651982Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Blenheim%20at%20MDC%20Office&Measurement=Barometric%20Pressure%20hPa&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4652863Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4653118Z   Total inserted: 291 records
2026-07-28T16:03:45.4653280Z 
2026-07-28T16:03:45.4653400Z Processing: MDC_BRANCH_AT_BRANCH_RECORDER
2026-07-28T16:03:45.4653697Z   Site: Branch at Branch Recorder
2026-07-28T16:03:45.4653990Z   Measurements: ['Rainfall', 'Wind Direction']
2026-07-28T16:03:45.4654299Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4655321Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Branch%20at%20Branch%20Recorder&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4656161Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4656429Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4657376Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Branch%20at%20Branch%20Recorder&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4658196Z       2026: no records parsed
2026-07-28T16:03:45.4658454Z   Total inserted: 97 records
2026-07-28T16:03:45.4658615Z 
2026-07-28T16:03:45.4658720Z Processing: MDC_BRANCH_AT_MT_MORRIS
2026-07-28T16:03:45.4659001Z   Site: Branch at Mt Morris
2026-07-28T16:03:45.4659360Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Direction']
2026-07-28T16:03:45.4659780Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4660582Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Branch%20at%20Mt%20Morris&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4661421Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4661688Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4662439Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Branch%20at%20Mt%20Morris&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4663235Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4663494Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4664239Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Branch%20at%20Mt%20Morris&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4665161Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4665433Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4666227Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Branch%20at%20Mt%20Morris&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4667024Z       2026: no records parsed
2026-07-28T16:03:45.4667280Z   Total inserted: 291 records
2026-07-28T16:03:45.4667437Z 
2026-07-28T16:03:45.4667556Z Processing: MDC_FLAXBOURNE_AT_CORRIE_DOWNS
2026-07-28T16:03:45.4667870Z   Site: Flaxbourne at Corrie Downs
2026-07-28T16:03:45.4668207Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall']
2026-07-28T16:03:45.4668568Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4669399Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Flaxbourne%20at%20Corrie%20Downs&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4670254Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4670516Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4671417Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Flaxbourne%20at%20Corrie%20Downs&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4672243Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4672503Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T16:03:45.4673276Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Flaxbourne%20at%20Corrie%20Downs&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:03:45.4674101Z       ✓ 2026: inserted 97 records
2026-07-28T16:03:45.4674355Z   Total inserted: 291 records
2026-07-28T16:03:45.4674514Z 
2026-07-28T16:03:45.4674655Z Processing: MDC_FLAXBOURNE_RIVER_AT_CORRIE_DOWNS
2026-07-28T16:11:52.3509435Z   Site: Flaxbourne River at Corrie Downs
2026-07-28T16:11:52.3513741Z   Measurements: ['Rainfall', 'Wind Direction']
2026-07-28T16:11:52.3514812Z     Rainfall: 2025-11-12 to 2026-07-29
2026-07-28T16:11:52.3517300Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Flaxbourne%20River%20at%20Corrie%20Downs&Measurement=Rainfall&From=12/11/2025&To=01/01/2026&Interval=30%20minutes
2026-07-28T16:11:52.3519948Z       Attempt 1/3 failed (('Connection aborted.', RemoteDisconnected('Remote end closed connection without response'))), retrying in 5s...
2026-07-28T16:11:52.3522594Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Flaxbourne%20River%20at%20Corrie%20Downs&Measurement=Rainfall&From=12/11/2025&To=01/01/2026&Interval=30%20minutes
2026-07-28T16:11:52.3524541Z       ✓ 2025: inserted 74 records
2026-07-28T16:11:52.3526336Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Flaxbourne%20River%20at%20Corrie%20Downs&Measurement=Rainfall&From=01/01/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3527939Z       2026: no records parsed
2026-07-28T16:11:52.3528460Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3530084Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Flaxbourne%20River%20at%20Corrie%20Downs&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3531744Z       2026: no records parsed
2026-07-28T16:11:52.3532246Z   Total inserted: 74 records
2026-07-28T16:11:52.3532547Z 
2026-07-28T16:11:52.3532753Z Processing: MDC_GLENVEIGH_NRFA
2026-07-28T16:11:52.3533253Z   Site: Glenveigh NRFA
2026-07-28T16:11:52.3534086Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction']
2026-07-28T16:11:52.3535334Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3536937Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Glenveigh%20NRFA&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3538502Z       ✓ 2026: inserted 97 records
2026-07-28T16:11:52.3539015Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3540419Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Glenveigh%20NRFA&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3541964Z       ✓ 2026: inserted 97 records
2026-07-28T16:11:52.3542483Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3543873Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Glenveigh%20NRFA&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3545703Z       ✓ 2026: inserted 97 records
2026-07-28T16:11:52.3546210Z     Wind Speed: 2026-07-21 to 2026-07-29
2026-07-28T16:11:52.3547627Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Glenveigh%20NRFA&Measurement=Wind%20Speed&From=21/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3549192Z       ✓ 2026: inserted 72 records
2026-07-28T16:11:52.3550067Z     Wind Gust: 2026-07-21 to 2026-07-29
2026-07-28T16:11:52.3551461Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Glenveigh%20NRFA&Measurement=Wind%20Gust&From=21/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3553020Z       ✓ 2026: inserted 72 records
2026-07-28T16:11:52.3553594Z     Wind Direction: 2026-07-21 to 2026-07-29
2026-07-28T16:11:52.3555870Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Glenveigh%20NRFA&Measurement=Wind%20Direction&From=21/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3557480Z       ✓ 2026: inserted 72 records
2026-07-28T16:11:52.3558011Z   Total inserted: 507 records
2026-07-28T16:11:52.3558324Z 
2026-07-28T16:11:52.3558576Z Processing: MDC_KAITUNA_RAINFALL_AT_HIGGINS_BRIDGE
2026-07-28T16:11:52.3559196Z   Site: Kaituna Rainfall at Higgins Bridge
2026-07-28T16:11:52.3559755Z   Measurements: ['Rainfall']
2026-07-28T16:11:52.3560221Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3561796Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kaituna%20Rainfall%20at%20Higgins%20Bridge&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3563494Z       ✓ 2026: inserted 97 records
2026-07-28T16:11:52.3563994Z   Total inserted: 97 records
2026-07-28T16:11:52.3564359Z 
2026-07-28T16:11:52.3564836Z Processing: MDC_KAITUNA_RIVER_AT_HIGGINS_BRIDGE
2026-07-28T16:11:52.3565757Z   Site: Kaituna River at Higgins Bridge
2026-07-28T16:11:52.3566133Z   Measurements: ['Rainfall', 'Wind Direction']
2026-07-28T16:11:52.3566454Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3567285Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kaituna%20River%20at%20Higgins%20Bridge&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3568116Z       2026: no records parsed
2026-07-28T16:11:52.3568404Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3569256Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kaituna%20River%20at%20Higgins%20Bridge&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3570101Z       2026: no records parsed
2026-07-28T16:11:52.3570359Z   Total inserted: 0 records
2026-07-28T16:11:52.3570513Z 
2026-07-28T16:11:52.3570637Z Processing: MDC_KENEPURU_HEAD_NRFA
2026-07-28T16:11:52.3570923Z   Site: Kenepuru Head NRFA
2026-07-28T16:11:52.3571490Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature', 'Soil Moisture']
2026-07-28T16:11:52.3572101Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3572915Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kenepuru%20Head%20NRFA&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3573810Z       ✓ 2026: inserted 97 records
2026-07-28T16:11:52.3574106Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3574855Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kenepuru%20Head%20NRFA&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3575956Z       ✓ 2026: inserted 97 records
2026-07-28T16:11:52.3576234Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3576984Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kenepuru%20Head%20NRFA&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3577768Z       ✓ 2026: inserted 97 records
2026-07-28T16:11:52.3578046Z     Wind Speed: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3578810Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kenepuru%20Head%20NRFA&Measurement=Wind%20Speed&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3579794Z       ✓ 2026: inserted 97 records
2026-07-28T16:11:52.3580060Z     Wind Gust: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3580824Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kenepuru%20Head%20NRFA&Measurement=Wind%20Gust&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3581637Z       ✓ 2026: inserted 97 records
2026-07-28T16:11:52.3581925Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3582726Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kenepuru%20Head%20NRFA&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3583543Z       ✓ 2026: inserted 97 records
2026-07-28T16:11:52.3583818Z     Soil Temperature: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3584626Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kenepuru%20Head%20NRFA&Measurement=Soil%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3585776Z       ✓ 2026: inserted 97 records
2026-07-28T16:11:52.3586053Z     Soil Moisture: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3586829Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Kenepuru%20Head%20NRFA&Measurement=Soil%20Moisture&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3587772Z       ✓ 2026: inserted 97 records
2026-07-28T16:11:52.3588043Z   Total inserted: 776 records
2026-07-28T16:11:52.3588201Z 
2026-07-28T16:11:52.3588311Z Processing: MDC_KOROMIKO_NRFA
2026-07-28T16:11:52.3588572Z   Site: Koromiko NRFA
2026-07-28T16:11:52.3589121Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature', 'Soil Moisture']
2026-07-28T16:11:52.3589736Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3590514Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3591336Z       ✓ 2026: inserted 92 records
2026-07-28T16:11:52.3591602Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3592329Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3593383Z       Attempt 1/3 failed (('Connection aborted.', RemoteDisconnected('Remote end closed connection without response'))), retrying in 5s...
2026-07-28T16:11:52.3594421Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3595480Z       ✓ 2026: inserted 92 records
2026-07-28T16:11:52.3595757Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3596474Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3597260Z       ✓ 2026: inserted 92 records
2026-07-28T16:11:52.3597521Z     Wind Speed: 2026-07-27 to 2026-07-29
2026-07-28T16:11:52.3598269Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Wind%20Speed&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:11:52.3599040Z       ✓ 2026: inserted 92 records
2026-07-28T16:11:52.3599304Z     Wind Gust: 2026-07-27 to 2026-07-29
2026-07-28T16:40:52.8492389Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Wind%20Gust&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:40:52.8494451Z       ✓ 2026: inserted 92 records
2026-07-28T16:40:52.8495178Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T16:40:52.8496578Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:40:52.8497477Z       ✓ 2026: inserted 92 records
2026-07-28T16:40:52.8497781Z     Soil Temperature: 2026-07-27 to 2026-07-29
2026-07-28T16:40:52.8498612Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Soil%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:40:52.8499454Z       ✓ 2026: inserted 92 records
2026-07-28T16:40:52.8499735Z     Soil Moisture: 2026-07-27 to 2026-07-29
2026-07-28T16:40:52.8500527Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Koromiko%20NRFA&Measurement=Soil%20Moisture&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:40:52.8501353Z       ✓ 2026: inserted 92 records
2026-07-28T16:40:52.8501627Z   Total inserted: 736 records
2026-07-28T16:40:52.8501809Z 
2026-07-28T16:40:52.8501923Z Processing: MDC_LAKE_ELTERWATER
2026-07-28T16:40:52.8502200Z   Site: Lake Elterwater Climate
2026-07-28T16:40:52.8502753Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Barometric Pressure hPa']
2026-07-28T16:40:52.8503350Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T16:40:52.8504365Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:40:52.8505664Z       ✓ 2026: inserted 97 records
2026-07-28T16:40:52.8506062Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T16:40:52.8506995Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:40:52.8508304Z       ✓ 2026: inserted 97 records
2026-07-28T16:40:52.8508599Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T16:40:52.8509543Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:40:52.8510385Z       ✓ 2026: inserted 97 records
2026-07-28T16:40:52.8510656Z     Wind Speed: 2026-07-27 to 2026-07-29
2026-07-28T16:40:52.8511448Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Wind%20Speed&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T16:40:52.8512276Z       ✓ 2026: inserted 97 records
2026-07-28T16:40:52.8512540Z     Wind Gust: 2023-12-31 to 2026-07-29
2026-07-28T16:40:52.8513312Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Wind%20Gust&From=31/12/2023&To=01/01/2024&Interval=30%20minutes
2026-07-28T16:40:52.8514130Z       ✓ 2023: inserted 49 records
2026-07-28T16:40:52.8515043Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Wind%20Gust&From=01/01/2024&To=01/01/2025&Interval=30%20minutes
2026-07-28T16:40:52.8516186Z       Attempt 1/3 failed (('Connection aborted.', RemoteDisconnected('Remote end closed connection without response'))), retrying in 5s...
2026-07-28T16:40:52.8517285Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Wind%20Gust&From=01/01/2024&To=01/01/2025&Interval=30%20minutes
2026-07-28T16:40:52.8518227Z       Database error: (psycopg2.errors.NumericValueOutOfRange) numeric field overflow
2026-07-28T16:40:52.8518822Z DETAIL:  A field with precision 10, scale 4 must round to an absolute value less than 10^6.
2026-07-28T16:40:52.8519179Z 
2026-07-28T16:40:52.8519264Z [SQL: 
2026-07-28T16:40:52.8519489Z                         INSERT INTO weather_data 
2026-07-28T16:40:52.8520050Z                             (station_id, timestamp, variable, value, unit, quality)
2026-07-28T16:40:52.8520581Z                         VALUES (%(station_id)s, %(timestamp)s, %(variable)s, %(value)s, %(unit)s, %(quality)s)
2026-07-28T16:40:52.8521076Z                         ON CONFLICT (station_id, timestamp, variable)
2026-07-28T16:40:52.8521414Z                         DO UPDATE SET
2026-07-28T16:40:52.8521705Z                             value = EXCLUDED.value,
2026-07-28T16:40:52.8522036Z                             quality = EXCLUDED.quality,
2026-07-28T16:40:52.8522350Z                             created_at = NOW()
2026-07-28T16:40:52.8522635Z                     ]
2026-07-28T16:40:52.8529093Z [parameters: [{'station_id': 100, 'timestamp': datetime.datetime(2024, 1, 1, 0, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.3354838, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2024, 1, 1, 0, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.3233333, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2024, 1, 1, 1, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.2, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2024, 1, 1, 1, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 0.9033333, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2024, 1, 1, 2, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.1, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2024, 1, 1, 2, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 0.92, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2024, 1, 1, 3, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.0129032, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2024, 1, 1, 3, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.2741935, 'unit': 'm/s', 'quality': 'GOOD'}  ... displaying 10 of 17569 total bound parameter sets ...  {'station_id': 100, 'timestamp': datetime.datetime(2024, 12, 31, 23, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 7.22, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 0, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 5.7083334, 'unit': 'm/s', 'quality': 'GOOD'}]]
2026-07-28T16:40:52.8535756Z (Background on this error at: https://sqlalche.me/e/20/9h9h)
2026-07-28T16:40:52.8536176Z       ✓ 2024: inserted 0 records
2026-07-28T16:40:52.8536955Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Wind%20Gust&From=01/01/2025&To=01/01/2026&Interval=30%20minutes
2026-07-28T16:40:52.8537900Z       Database error: (psycopg2.errors.NumericValueOutOfRange) numeric field overflow
2026-07-28T16:40:52.8538502Z DETAIL:  A field with precision 10, scale 4 must round to an absolute value less than 10^6.
2026-07-28T16:40:52.8538855Z 
2026-07-28T16:40:52.8538940Z [SQL: 
2026-07-28T16:40:52.8539167Z                         INSERT INTO weather_data 
2026-07-28T16:40:52.8539546Z                             (station_id, timestamp, variable, value, unit, quality)
2026-07-28T16:40:52.8540070Z                         VALUES (%(station_id)s, %(timestamp)s, %(variable)s, %(value)s, %(unit)s, %(quality)s)
2026-07-28T16:40:52.8540573Z                         ON CONFLICT (station_id, timestamp, variable)
2026-07-28T16:40:52.8540910Z                         DO UPDATE SET
2026-07-28T16:40:52.8541205Z                             value = EXCLUDED.value,
2026-07-28T16:40:52.8541670Z                             quality = EXCLUDED.quality,
2026-07-28T16:40:52.8541981Z                             created_at = NOW()
2026-07-28T16:40:52.8542265Z                     ]
2026-07-28T16:40:52.8548689Z [parameters: [{'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 0, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 5.7083334, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 0, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 7.1685715, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 1, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 5.163636, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 1, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 5.27561, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 2, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 5.7741935, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 2, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 5.4461539, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 3, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 5.625, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2025, 1, 1, 3, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 4.509091, 'unit': 'm/s', 'quality': 'GOOD'}  ... displaying 10 of 17521 total bound parameter sets ...  {'station_id': 100, 'timestamp': datetime.datetime(2025, 12, 31, 23, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 2.4, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 0, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 3.1842105, 'unit': 'm/s', 'quality': 'GOOD'}]]
2026-07-28T17:12:15.0936894Z (Background on this error at: https://sqlalche.me/e/20/9h9h)
2026-07-28T17:12:15.0937731Z       ✓ 2025: inserted 0 records
2026-07-28T17:12:15.0938824Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Wind%20Gust&From=01/01/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.0940103Z       Database error: (psycopg2.errors.NumericValueOutOfRange) numeric field overflow
2026-07-28T17:12:15.0940900Z DETAIL:  A field with precision 10, scale 4 must round to an absolute value less than 10^6.
2026-07-28T17:12:15.0941385Z 
2026-07-28T17:12:15.0941497Z [SQL: 
2026-07-28T17:12:15.0941790Z                         INSERT INTO weather_data 
2026-07-28T17:12:15.0942317Z                             (station_id, timestamp, variable, value, unit, quality)
2026-07-28T17:12:15.0943025Z                         VALUES (%(station_id)s, %(timestamp)s, %(variable)s, %(value)s, %(unit)s, %(quality)s)
2026-07-28T17:12:15.0943695Z                         ON CONFLICT (station_id, timestamp, variable)
2026-07-28T17:12:15.0944136Z                         DO UPDATE SET
2026-07-28T17:12:15.0944523Z                             value = EXCLUDED.value,
2026-07-28T17:12:15.0945318Z                             quality = EXCLUDED.quality,
2026-07-28T17:12:15.0945774Z                             created_at = NOW()
2026-07-28T17:12:15.0946161Z                     ]
2026-07-28T17:12:15.0955464Z [parameters: [{'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 0, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 3.1842105, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 0, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 4.3909089, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 1, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 3.721428624, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 1, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 5.1800001, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 2, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.490476, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 2, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 4.2380952, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 3, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.842857, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 1, 1, 3, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': 1.36, 'unit': 'm/s', 'quality': 'GOOD'}  ... displaying 10 of 10033 total bound parameter sets ...  {'station_id': 100, 'timestamp': datetime.datetime(2026, 7, 28, 23, 30, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': -3.4028234663852886e+38, 'unit': 'm/s', 'quality': 'GOOD'}, {'station_id': 100, 'timestamp': datetime.datetime(2026, 7, 29, 0, 0, tzinfo=zoneinfo.ZoneInfo(key='Pacific/Auckland')), 'variable': 'wind_gust', 'value': -3.4028234663852886e+38, 'unit': 'm/s', 'quality': 'GOOD'}]]
2026-07-28T17:12:15.0962263Z (Background on this error at: https://sqlalche.me/e/20/9h9h)
2026-07-28T17:12:15.0962716Z       ✓ 2026: inserted 0 records
2026-07-28T17:12:15.0963006Z     Wind Direction: 2026-07-05 to 2026-07-29
2026-07-28T17:12:15.0963842Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Wind%20Direction&From=05/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.0964695Z       ✓ 2026: inserted 54 records
2026-07-28T17:12:15.0965439Z     Barometric Pressure hPa: 2026-07-27 to 2026-07-29
2026-07-28T17:12:15.0966367Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lake%20Elterwater%20Climate&Measurement=Barometric%20Pressure%20hPa&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.0967272Z       ✓ 2026: inserted 97 records
2026-07-28T17:12:15.0967540Z   Total inserted: 588 records
2026-07-28T17:12:15.0967710Z 
2026-07-28T17:12:15.0967821Z Processing: MDC_LANSDOWNE_NRFA
2026-07-28T17:12:15.0968080Z   Site: Lansdowne NRFA
2026-07-28T17:12:15.0968627Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature', 'Soil Moisture']
2026-07-28T17:12:15.0969248Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:12:15.0970028Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lansdowne%20NRFA&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.0970835Z       ✓ 2026: inserted 97 records
2026-07-28T17:12:15.0971102Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T17:12:15.0971842Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lansdowne%20NRFA&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.0972607Z       ✓ 2026: inserted 97 records
2026-07-28T17:12:15.0972871Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:12:15.0973591Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lansdowne%20NRFA&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.0974364Z       ✓ 2026: inserted 97 records
2026-07-28T17:12:15.0974805Z     Wind Speed: 2026-07-27 to 2026-07-29
2026-07-28T17:12:15.0975705Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lansdowne%20NRFA&Measurement=Wind%20Speed&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.0976497Z       ✓ 2026: inserted 97 records
2026-07-28T17:12:15.0976757Z     Wind Gust: 2026-07-27 to 2026-07-29
2026-07-28T17:12:15.0977497Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lansdowne%20NRFA&Measurement=Wind%20Gust&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.0978275Z       ✓ 2026: inserted 97 records
2026-07-28T17:12:15.0978544Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T17:12:15.0979319Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lansdowne%20NRFA&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.0980114Z       ✓ 2026: inserted 97 records
2026-07-28T17:12:15.0980391Z     Soil Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:12:15.0981166Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lansdowne%20NRFA&Measurement=Soil%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.0981964Z       ✓ 2026: inserted 97 records
2026-07-28T17:12:15.0982360Z     Soil Moisture: 2026-07-27 to 2026-07-29
2026-07-28T17:12:15.0983122Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Lansdowne%20NRFA&Measurement=Soil%20Moisture&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.0983915Z       ✓ 2026: inserted 97 records
2026-07-28T17:12:15.0984171Z   Total inserted: 776 records
2026-07-28T17:12:15.0984336Z 
2026-07-28T17:12:15.0984436Z Processing: MDC_MALINGS
2026-07-28T17:12:15.0984665Z   Site: Malings
2026-07-28T17:12:15.0985016Z   Measurements: ['Rainfall']
2026-07-28T17:12:15.0985289Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:12:15.0985984Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Malings&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.0986724Z       ✓ 2026: inserted 97 records
2026-07-28T17:12:15.0986977Z   Total inserted: 97 records
2026-07-28T17:12:15.0987134Z 
2026-07-28T17:12:15.0987256Z Processing: MDC_MID_AWATERE_VALLEY_NRFA
2026-07-28T17:12:15.0987555Z   Site: Mid Awatere Valley NRFA
2026-07-28T17:12:15.0988122Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature', 'Soil Moisture']
2026-07-28T17:12:15.0988727Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:12:15.0989561Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Mid%20Awatere%20Valley%20NRFA&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.0990414Z       ✓ 2026: inserted 97 records
2026-07-28T17:12:15.0990673Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T17:12:15.0991436Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Mid%20Awatere%20Valley%20NRFA&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.0992263Z       ✓ 2026: inserted 97 records
2026-07-28T17:12:15.0999100Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:12:15.0999946Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Mid%20Awatere%20Valley%20NRFA&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.1000835Z       ✓ 2026: inserted 97 records
2026-07-28T17:12:15.1001124Z     Wind Speed: 2026-07-27 to 2026-07-29
2026-07-28T17:12:15.1001930Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Mid%20Awatere%20Valley%20NRFA&Measurement=Wind%20Speed&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.1002964Z       ✓ 2026: inserted 97 records
2026-07-28T17:12:15.1003229Z     Wind Gust: 2026-07-27 to 2026-07-29
2026-07-28T17:12:15.1004011Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Mid%20Awatere%20Valley%20NRFA&Measurement=Wind%20Gust&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:12:15.1004846Z       ✓ 2026: inserted 97 records
2026-07-28T17:12:15.1005337Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7812461Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Mid%20Awatere%20Valley%20NRFA&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7815343Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7816181Z     Soil Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7817302Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Mid%20Awatere%20Valley%20NRFA&Measurement=Soil%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7818503Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7818841Z     Soil Moisture: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7820286Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Mid%20Awatere%20Valley%20NRFA&Measurement=Soil%20Moisture&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7821349Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7821676Z   Total inserted: 776 records
2026-07-28T17:20:22.7821881Z 
2026-07-28T17:20:22.7822007Z Processing: MDC_MOLESWORTH_NRFA
2026-07-28T17:20:22.7822335Z   Site: Molesworth NRFA
2026-07-28T17:20:22.7823019Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature', 'Soil Moisture']
2026-07-28T17:20:22.7823785Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7825209Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Molesworth%20NRFA&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7826830Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7827325Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7828828Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Molesworth%20NRFA&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7830195Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7830531Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7831582Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Molesworth%20NRFA&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7832426Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7832700Z     Wind Speed: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7833461Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Molesworth%20NRFA&Measurement=Wind%20Speed&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7834280Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7834546Z     Wind Gust: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7835567Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Molesworth%20NRFA&Measurement=Wind%20Gust&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7836367Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7836653Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7837432Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Molesworth%20NRFA&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7838229Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7838512Z     Soil Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7839538Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Molesworth%20NRFA&Measurement=Soil%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7840352Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7840623Z     Soil Moisture: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7841393Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Molesworth%20NRFA&Measurement=Soil%20Moisture&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7842186Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7842445Z   Total inserted: 776 records
2026-07-28T17:20:22.7842609Z 
2026-07-28T17:20:22.7842719Z Processing: MDC_NGARURU_NRFA
2026-07-28T17:20:22.7842974Z   Site: Ngaruru NRFA
2026-07-28T17:20:22.7843635Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Barometric Pressure hPa', 'Soil Temperature', 'Soil Moisture']
2026-07-28T17:20:22.7844358Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7845362Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7846180Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7846446Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7847306Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7848075Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7848338Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7849046Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7849799Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7850078Z     Wind Speed: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7850805Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Wind%20Speed&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7851583Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7851840Z     Wind Gust: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7852569Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Wind%20Gust&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7853331Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7853597Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7854357Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7855427Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7855739Z     Barometric Pressure hPa: 2022-12-12 to 2026-07-29
2026-07-28T17:20:22.7856575Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Barometric%20Pressure%20hPa&From=12/12/2022&To=01/01/2023&Interval=30%20minutes
2026-07-28T17:20:22.7857412Z       ✓ 2022: inserted 116 records
2026-07-28T17:20:22.7858193Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Barometric%20Pressure%20hPa&From=01/01/2023&To=01/01/2024&Interval=30%20minutes
2026-07-28T17:20:22.7858982Z       2023: no records parsed
2026-07-28T17:20:22.7859774Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Barometric%20Pressure%20hPa&From=01/01/2024&To=01/01/2025&Interval=30%20minutes
2026-07-28T17:20:22.7860558Z       2024: no records parsed
2026-07-28T17:20:22.7861312Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Barometric%20Pressure%20hPa&From=01/01/2025&To=01/01/2026&Interval=30%20minutes
2026-07-28T17:20:22.7862259Z       2025: no records parsed
2026-07-28T17:20:22.7863004Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Barometric%20Pressure%20hPa&From=01/01/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7863788Z       2026: no records parsed
2026-07-28T17:20:22.7864052Z     Soil Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7864827Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Soil%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7865931Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7866207Z     Soil Moisture: 2026-07-27 to 2026-07-29
2026-07-28T17:20:22.7866961Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Ngaruru%20NRFA&Measurement=Soil%20Moisture&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7867748Z       ✓ 2026: inserted 97 records
2026-07-28T17:20:22.7868010Z   Total inserted: 892 records
2026-07-28T17:20:22.7868174Z 
2026-07-28T17:20:22.7868273Z Processing: MDC_O_DWYERS_ROAD
2026-07-28T17:20:22.7868531Z   Site: O Dwyers Road NRFA
2026-07-28T17:20:22.7868973Z   Measurements: ['Air Temperature', 'Rainfall', 'Humidity']
2026-07-28T17:20:22.7869347Z     Air Temperature: 2022-07-27 to 2026-07-29
2026-07-28T17:20:22.7870154Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Air%20Temperature&From=27/07/2022&To=01/01/2023&Interval=30%20minutes
2026-07-28T17:20:22.7870986Z       ✓ 2022: inserted 32 records
2026-07-28T17:20:22.7871742Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Air%20Temperature&From=01/01/2023&To=01/01/2024&Interval=30%20minutes
2026-07-28T17:20:22.7872528Z       2023: no records parsed
2026-07-28T17:20:22.7873283Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Air%20Temperature&From=01/01/2024&To=01/01/2025&Interval=30%20minutes
2026-07-28T17:20:22.7874064Z       2024: no records parsed
2026-07-28T17:20:22.7874806Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Air%20Temperature&From=01/01/2025&To=01/01/2026&Interval=30%20minutes
2026-07-28T17:20:22.7875853Z       2025: no records parsed
2026-07-28T17:20:22.7876600Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Air%20Temperature&From=01/01/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:20:22.7877386Z       2026: no records parsed
2026-07-28T17:20:22.7877636Z     Rainfall: 2022-07-27 to 2026-07-29
2026-07-28T17:20:22.7878385Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Rainfall&From=27/07/2022&To=01/01/2023&Interval=30%20minutes
2026-07-28T17:20:22.7879187Z       ✓ 2022: inserted 32 records
2026-07-28T17:27:21.3334388Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Rainfall&From=01/01/2023&To=01/01/2024&Interval=30%20minutes
2026-07-28T17:27:21.3335632Z       2023: no records parsed
2026-07-28T17:27:21.3336463Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Rainfall&From=01/01/2024&To=01/01/2025&Interval=30%20minutes
2026-07-28T17:27:21.3337316Z       2024: no records parsed
2026-07-28T17:27:21.3338108Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Rainfall&From=01/01/2025&To=01/01/2026&Interval=30%20minutes
2026-07-28T17:27:21.3339345Z       2025: no records parsed
2026-07-28T17:27:21.3340123Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Rainfall&From=01/01/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3340940Z       2026: no records parsed
2026-07-28T17:27:21.3341219Z     Humidity: 2022-07-27 to 2026-07-29
2026-07-28T17:27:21.3342041Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Humidity&From=27/07/2022&To=01/01/2023&Interval=30%20minutes
2026-07-28T17:27:21.3343172Z       ✓ 2022: inserted 32 records
2026-07-28T17:27:21.3344033Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Humidity&From=01/01/2023&To=01/01/2024&Interval=30%20minutes
2026-07-28T17:27:21.3345118Z       2023: no records parsed
2026-07-28T17:27:21.3346007Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Humidity&From=01/01/2024&To=01/01/2025&Interval=30%20minutes
2026-07-28T17:27:21.3346896Z       2024: no records parsed
2026-07-28T17:27:21.3348031Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Humidity&From=01/01/2025&To=01/01/2026&Interval=30%20minutes
2026-07-28T17:27:21.3349261Z       2025: no records parsed
2026-07-28T17:27:21.3350459Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=O%20Dwyers%20Road%20NRFA&Measurement=Humidity&From=01/01/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3351504Z       2026: no records parsed
2026-07-28T17:27:21.3351795Z   Total inserted: 96 records
2026-07-28T17:27:21.3351979Z 
2026-07-28T17:27:21.3352150Z Processing: MDC_OMAKA_AT_RAMSHEAD_SADDLE
2026-07-28T17:27:21.3352600Z   Site: Omaka at Ramshead Saddle
2026-07-28T17:27:21.3353031Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Direction']
2026-07-28T17:27:21.3353585Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3354471Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Omaka%20at%20Ramshead%20Saddle&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3355584Z       ✓ 2026: inserted 97 records
2026-07-28T17:27:21.3355855Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3356657Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Omaka%20at%20Ramshead%20Saddle&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3357485Z       ✓ 2026: inserted 97 records
2026-07-28T17:27:21.3357762Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3358534Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Omaka%20at%20Ramshead%20Saddle&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3359367Z       ✓ 2026: inserted 97 records
2026-07-28T17:27:21.3359644Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3360466Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Omaka%20at%20Ramshead%20Saddle&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3361285Z       2026: no records parsed
2026-07-28T17:27:21.3361537Z   Total inserted: 291 records
2026-07-28T17:27:21.3361699Z 
2026-07-28T17:27:21.3361843Z Processing: MDC_ONAMALUTU_AT_BARTLETTS_CREEK_SADDLE
2026-07-28T17:27:21.3362191Z   Site: Onamalutu at Bartletts Creek Saddle
2026-07-28T17:27:21.3362505Z   Measurements: ['Rainfall']
2026-07-28T17:27:21.3362767Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3363583Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Bartletts%20Creek%20Saddle&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3364631Z       ✓ 2026: inserted 97 records
2026-07-28T17:27:21.3365021Z   Total inserted: 97 records
2026-07-28T17:27:21.3365193Z 
2026-07-28T17:27:21.3365330Z Processing: MDC_ONAMALUTU_AT_HILLTOP_ROAD_NRFA
2026-07-28T17:27:21.3365652Z   Site: Onamalutu at Hilltop Road NRFA
2026-07-28T17:27:21.3366242Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature', 'Soil Moisture']
2026-07-28T17:27:21.3366856Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3367709Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Hilltop%20Road%20NRFA&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3368595Z       ✓ 2026: inserted 97 records
2026-07-28T17:27:21.3368862Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3369682Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Hilltop%20Road%20NRFA&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3370533Z       ✓ 2026: inserted 97 records
2026-07-28T17:27:21.3370796Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3371733Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Hilltop%20Road%20NRFA&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3372586Z       ✓ 2026: inserted 97 records
2026-07-28T17:27:21.3372854Z     Wind Speed: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3373669Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Hilltop%20Road%20NRFA&Measurement=Wind%20Speed&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3374528Z       ✓ 2026: inserted 97 records
2026-07-28T17:27:21.3374793Z     Wind Gust: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3375728Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Hilltop%20Road%20NRFA&Measurement=Wind%20Gust&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3376583Z       ✓ 2026: inserted 97 records
2026-07-28T17:27:21.3376864Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3377706Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Hilltop%20Road%20NRFA&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3378568Z       ✓ 2026: inserted 97 records
2026-07-28T17:27:21.3378845Z     Soil Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3379700Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Hilltop%20Road%20NRFA&Measurement=Soil%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3380583Z       ✓ 2026: inserted 97 records
2026-07-28T17:27:21.3380857Z     Soil Moisture: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3381684Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Onamalutu%20at%20Hilltop%20Road%20NRFA&Measurement=Soil%20Moisture&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3382559Z       ✓ 2026: inserted 97 records
2026-07-28T17:27:21.3382815Z   Total inserted: 776 records
2026-07-28T17:27:21.3382983Z 
2026-07-28T17:27:21.3383092Z Processing: MDC_PELORUS_AT_1446
2026-07-28T17:27:21.3383358Z   Site: Pelorus at 1446
2026-07-28T17:27:21.3383714Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Direction']
2026-07-28T17:27:21.3384142Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3385042Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pelorus%20at%201446&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3386023Z       ✓ 2026: inserted 97 records
2026-07-28T17:27:21.3386292Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3387025Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pelorus%20at%201446&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3387810Z       ✓ 2026: inserted 97 records
2026-07-28T17:27:21.3388070Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3388790Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pelorus%20at%201446&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3389558Z       ✓ 2026: inserted 97 records
2026-07-28T17:27:21.3389842Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3390609Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pelorus%20at%201446&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3391389Z       2026: no records parsed
2026-07-28T17:27:21.3391647Z   Total inserted: 291 records
2026-07-28T17:27:21.3391808Z 
2026-07-28T17:27:21.3391946Z Processing: MDC_PICTON_CLIMATE_AT_WAITOHI_DOMAIN
2026-07-28T17:27:21.3392288Z   Site: Picton Climate at Waitohi Domain
2026-07-28T17:27:21.3392975Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Barometric Pressure hPa']
2026-07-28T17:27:21.3393562Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3394418Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Picton%20Climate%20at%20Waitohi%20Domain&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3395441Z       ✓ 2026: inserted 97 records
2026-07-28T17:27:21.3395712Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T17:27:21.3396523Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Picton%20Climate%20at%20Waitohi%20Domain&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:27:21.3397377Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.1976014Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.1978227Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Picton%20Climate%20at%20Waitohi%20Domain&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.1980627Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.1981350Z     Wind Speed: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.1983559Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Picton%20Climate%20at%20Waitohi%20Domain&Measurement=Wind%20Speed&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.1985764Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.1986361Z     Wind Gust: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.1988088Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Picton%20Climate%20at%20Waitohi%20Domain&Measurement=Wind%20Gust&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.1989875Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.1990410Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.1992072Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Picton%20Climate%20at%20Waitohi%20Domain&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.1993662Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.1993998Z     Barometric Pressure hPa: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.1995189Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Picton%20Climate%20at%20Waitohi%20Domain&Measurement=Barometric%20Pressure%20hPa&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.1996959Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.1997241Z   Total inserted: 679 records
2026-07-28T17:36:35.1997410Z 
2026-07-28T17:36:35.1997604Z Processing: MDC_PUDDING_HILL_NRFA
2026-07-28T17:36:35.1997994Z   Site: Pudding Hill NRFA
2026-07-28T17:36:35.1998575Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature', 'Soil Moisture']
2026-07-28T17:36:35.1999373Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2000188Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2001289Z       Attempt 1/3 failed (('Connection aborted.', RemoteDisconnected('Remote end closed connection without response'))), retrying in 5s...
2026-07-28T17:36:35.2002419Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2003291Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2003564Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2004507Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2005517Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2005790Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2006545Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2007328Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2007597Z     Wind Speed: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2008359Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Wind%20Speed&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2009149Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2009407Z     Wind Gust: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2010160Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Wind%20Gust&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2010945Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2011217Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2011995Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2012794Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2013072Z     Soil Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2013876Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Soil%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2014686Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2015118Z     Soil Moisture: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2015933Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Pudding%20Hill%20NRFA&Measurement=Soil%20Moisture&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2016755Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2017014Z   Total inserted: 776 records
2026-07-28T17:36:35.2017180Z 
2026-07-28T17:36:35.2017294Z Processing: MDC_RAI_AT_RAI_FALLS
2026-07-28T17:36:35.2017563Z   Site: Rai at Rai Falls
2026-07-28T17:36:35.2017915Z   Measurements: ['Rainfall', 'Wind Direction', 'Barometric Pressure hPa']
2026-07-28T17:36:35.2018344Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2019240Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20at%20Rai%20Falls&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2020057Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2020333Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2021131Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20at%20Rai%20Falls&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2021911Z       2026: no records parsed
2026-07-28T17:36:35.2022203Z     Barometric Pressure hPa: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2023057Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20at%20Rai%20Falls&Measurement=Barometric%20Pressure%20hPa&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2023907Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2024177Z   Total inserted: 194 records
2026-07-28T17:36:35.2024338Z 
2026-07-28T17:36:35.2024443Z Processing: MDC_RAI_VALLEY_NRFA
2026-07-28T17:36:35.2024711Z   Site: Rai Valley NRFA
2026-07-28T17:36:35.2025482Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Barometric Pressure hPa', 'Soil Temperature', 'Soil Moisture']
2026-07-28T17:36:35.2026309Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2027109Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2027929Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2028196Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2028929Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2029716Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2029976Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2030694Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2031465Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2031733Z     Wind Speed: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2032475Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Wind%20Speed&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2033265Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2033523Z     Wind Gust: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2034259Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Wind%20Gust&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2035171Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2035455Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2036224Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2037037Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2037333Z     Barometric Pressure hPa: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2038177Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Barometric%20Pressure%20hPa&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2039021Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2039295Z     Soil Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2040086Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Soil%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2041032Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2041301Z     Soil Moisture: 2026-07-27 to 2026-07-29
2026-07-28T17:36:35.2042069Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rai%20Valley%20NRFA&Measurement=Soil%20Moisture&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:36:35.2042858Z       ✓ 2026: inserted 97 records
2026-07-28T17:36:35.2043118Z   Total inserted: 873 records
2026-07-28T17:36:35.2043275Z 
2026-07-28T17:36:35.2043392Z Processing: MDC_RARANGI_AT_DRIVING_RANGE
2026-07-28T17:36:35.2043694Z   Site: Rarangi at Driving Range
2026-07-28T17:36:35.2043958Z   Measurements: ['Rainfall']
2026-07-28T17:36:35.2044224Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4637047Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Rarangi%20at%20Driving%20Range&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4638916Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4639475Z   Total inserted: 97 records
2026-07-28T17:45:13.4639779Z 
2026-07-28T17:45:13.4639973Z Processing: MDC_RED_HILLS
2026-07-28T17:45:13.4640448Z   Site: Red Hills
2026-07-28T17:45:13.4640990Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall']
2026-07-28T17:45:13.4642120Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4643557Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Red%20Hills&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4645439Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4645936Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4647247Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Red%20Hills&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4648691Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4649163Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4650499Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Red%20Hills&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4651735Z       2026: no records parsed
2026-07-28T17:45:13.4652215Z   Total inserted: 194 records
2026-07-28T17:45:13.4652513Z 
2026-07-28T17:45:13.4652633Z Processing: MDC_ST_ARNAUD_NRFA
2026-07-28T17:45:13.4652949Z   Site: St Arnaud NRFA
2026-07-28T17:45:13.4653691Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Soil Temperature', 'Soil Moisture']
2026-07-28T17:45:13.4654567Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4655792Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=St%20Arnaud%20NRFA&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4656844Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4657128Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4657864Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=St%20Arnaud%20NRFA&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4658645Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4658911Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4659628Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=St%20Arnaud%20NRFA&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4660396Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4660660Z     Wind Speed: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4661404Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=St%20Arnaud%20NRFA&Measurement=Wind%20Speed&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4662431Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4662695Z     Wind Gust: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4663426Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=St%20Arnaud%20NRFA&Measurement=Wind%20Gust&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4664218Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4664502Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4665477Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=St%20Arnaud%20NRFA&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4666300Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4666584Z     Soil Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4667374Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=St%20Arnaud%20NRFA&Measurement=Soil%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4668194Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4668459Z     Soil Moisture: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4669360Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=St%20Arnaud%20NRFA&Measurement=Soil%20Moisture&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4670442Z       Attempt 1/3 failed (('Connection aborted.', RemoteDisconnected('Remote end closed connection without response'))), retrying in 5s...
2026-07-28T17:45:13.4671521Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=St%20Arnaud%20NRFA&Measurement=Soil%20Moisture&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4672319Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4672578Z   Total inserted: 776 records
2026-07-28T17:45:13.4672747Z 
2026-07-28T17:45:13.4672880Z Processing: MDC_TAYLOR_AT_BENEAGLE_STATION
2026-07-28T17:45:13.4673182Z   Site: Taylor at Beneagle Station
2026-07-28T17:45:13.4673487Z   Measurements: ['Rainfall', 'Wind Direction']
2026-07-28T17:45:13.4673796Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4674580Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Taylor%20at%20Beneagle%20Station&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4675586Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4675857Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4676675Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Taylor%20at%20Beneagle%20Station&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4677486Z       2026: no records parsed
2026-07-28T17:45:13.4677746Z   Total inserted: 97 records
2026-07-28T17:45:13.4677906Z 
2026-07-28T17:45:13.4678021Z Processing: MDC_TAYLOR_AT_TINPOT
2026-07-28T17:45:13.4678295Z   Site: Taylor at Tinpot
2026-07-28T17:45:13.4678610Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall']
2026-07-28T17:45:13.4678972Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4679786Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Taylor%20at%20Tinpot&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4680618Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4680891Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4681631Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Taylor%20at%20Tinpot&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4682419Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4682681Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4683407Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Taylor%20at%20Tinpot&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4684326Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4684583Z   Total inserted: 291 records
2026-07-28T17:45:13.4684747Z 
2026-07-28T17:45:13.4684866Z Processing: MDC_TAYLOR_PASS_LANDFILL
2026-07-28T17:45:13.4685288Z   Site: Taylor at Taylor Pass Landfill
2026-07-28T17:45:13.4685859Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Speed', 'Wind Gust', 'Wind Direction', 'Barometric Pressure hPa']
2026-07-28T17:45:13.4686464Z     Air Temperature: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4695644Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Taylor%20at%20Taylor%20Pass%20Landfill&Measurement=Air%20Temperature&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4696641Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4696935Z     Humidity: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4697784Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Taylor%20at%20Taylor%20Pass%20Landfill&Measurement=Humidity&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4698655Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4698925Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4699899Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Taylor%20at%20Taylor%20Pass%20Landfill&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4700739Z       2026: no records parsed
2026-07-28T17:45:13.4701010Z     Wind Speed: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4701835Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Taylor%20at%20Taylor%20Pass%20Landfill&Measurement=Wind%20Speed&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4702714Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4702993Z     Wind Gust: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4703826Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Taylor%20at%20Taylor%20Pass%20Landfill&Measurement=Wind%20Gust&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4704670Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4705205Z     Wind Direction: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4706048Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Taylor%20at%20Taylor%20Pass%20Landfill&Measurement=Wind%20Direction&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4706917Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4707221Z     Barometric Pressure hPa: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4708125Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Taylor%20at%20Taylor%20Pass%20Landfill&Measurement=Barometric%20Pressure%20hPa&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4709037Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4709296Z   Total inserted: 582 records
2026-07-28T17:45:13.4709461Z 
2026-07-28T17:45:13.4709565Z Processing: MDC_TE_RAPA
2026-07-28T17:45:13.4709803Z   Site: Te Rapa
2026-07-28T17:45:13.4710032Z   Measurements: ['Rainfall']
2026-07-28T17:45:13.4710297Z     Rainfall: 2026-07-27 to 2026-07-29
2026-07-28T17:45:13.4711010Z       URL: https://hydro.marlborough.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=Te%20Rapa&Measurement=Rainfall&From=27/07/2026&To=29/07/2026&Interval=30%20minutes
2026-07-28T17:45:13.4711764Z       ✓ 2026: inserted 97 records
2026-07-28T17:45:13.4712024Z   Total inserted: 97 records
2026-07-28T17:45:13.4712181Z 
2026-07-28T17:45:13.4712316Z Processing: MDC_TOP_VALLEY_AT_STAIRCASE_RIDGE
2026-07-28T17:45:13.4712634Z   Site: Top Valley at Staircase Ridge
2026-07-28T17:45:13.4713027Z   Measurements: ['Air Temperature', 'Humidity', 'Rainfall', 'Wind Direction']
2026-07-28T17:45:13.4713598Z     Air Temperature: 2020-12-31 to 2026-07-29
2026-07-28T20:20:28.5466981Z ##[error]The operation was canceled.
2026-07-28T20:20:28.5601242Z Node 20 is being deprecated. This workflow is running with Node 24 by default. If you need to temporarily use Node 20, you can set the ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true environment variable. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
2026-07-28T20:20:28.5602523Z Post job cleanup.
2026-07-28T20:20:28.6429515Z [command]/usr/bin/git version
2026-07-28T20:20:28.6505211Z git version 2.54.0
2026-07-28T20:20:28.6543799Z Temporarily overriding HOME='/home/runner/work/_temp/31eb6195-b9a1-4953-8bda-5f049f9be2c1' before making global git config changes
2026-07-28T20:20:28.6545500Z Adding repository directory to the temporary git global config as a safe directory
2026-07-28T20:20:28.6550382Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/auxein-insights/auxein-insights
2026-07-28T20:20:28.6588539Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-07-28T20:20:28.6625719Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-07-28T20:20:28.6877325Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-07-28T20:20:28.6916380Z http.https://github.com/.extraheader
2026-07-28T20:20:28.6927964Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
2026-07-28T20:20:28.6964737Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-07-28T20:20:28.7216364Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
2026-07-28T20:20:28.7254016Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
2026-07-28T20:20:28.7637540Z Cleaning up orphan processes
2026-07-28T20:20:28.7960009Z Terminate orphan process: pid (2806) (python)
2026-07-28T20:20:28.8116692Z ##[warning]Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/setup-python@v5. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/