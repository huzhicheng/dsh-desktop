# 手动卸载 DSH Desktop（当 NSIS 卸载器损坏、无法正常卸载时使用）。
#
# 用法：在 PowerShell 中执行
#   powershell -ExecutionPolicy Bypass -File win-cleanup.ps1 -DryRun   # 先演练，只列出将删除的内容
#   powershell -ExecutionPolicy Bypass -File win-cleanup.ps1           # 实际执行
#   powershell -ExecutionPolicy Bypass -File win-cleanup.ps1 -KeepData # 保留会话记录与已装运行时
#
# 注意：本文件必须保存为「带 BOM 的 UTF-8」。Windows PowerShell 5.1 在中文系统上
# 会把无 BOM 的 UTF-8 当作 GBK 解码，导致中文变乱码并引发语法错误。

param([switch]$KeepData, [switch]$DryRun)

$ErrorActionPreference = 'Continue'
$installDir = Join-Path $env:LOCALAPPDATA 'Programs\DSH Desktop'
$dataDir    = Join-Path $env:APPDATA 'DSH Desktop'

if ($DryRun) { Write-Host '演练模式：只列出将要执行的操作，不会真正删除。' -ForegroundColor Yellow }

function Remove-Target {
  param([string]$Path, [string]$Label)
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  if ($DryRun) {
    Write-Host ("   [演练] 将删除{0} {1}" -f $Label, $Path)
    return $true
  }
  Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $Path) {
    Write-Warning ("   未能完全删除，请关闭占用它的程序后重试：{0}" -f $Path)
  } else {
    Write-Host ("   已删除{0} {1}" -f $Label, $Path)
  }
  return $true
}

Write-Host '1/4 结束正在运行的进程...'
# 只处理安装目录下的进程，避免误杀用户自己的 node / electron。
# 部分系统进程无权读取 Path，逐个 try 掉，不让报错中断流程。
$found = 0
foreach ($proc in (Get-Process -ErrorAction SilentlyContinue)) {
  $path = $null
  try { $path = $proc.Path } catch { $path = $null }
  if ($path -and $path.StartsWith($installDir, [System.StringComparison]::OrdinalIgnoreCase)) {
    $found++
    if ($DryRun) {
      Write-Host ("   [演练] 将结束 {0} (PID {1})" -f $proc.ProcessName, $proc.Id)
    } else {
      Write-Host ("   结束 {0} (PID {1})" -f $proc.ProcessName, $proc.Id)
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
if ($found -eq 0) { Write-Host '   没有正在运行的相关进程' }
if (-not $DryRun -and $found -gt 0) { Start-Sleep -Seconds 2 }

Write-Host '2/4 删除程序目录...'
if (-not (Remove-Target -Path $installDir -Label '程序目录')) {
  Write-Host '   程序目录不存在，跳过'
}

Write-Host '3/4 清理注册表卸载项与快捷方式...'
$uninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
foreach ($key in (Get-ChildItem $uninstallRoot -ErrorAction SilentlyContinue)) {
  $name = (Get-ItemProperty $key.PSPath -ErrorAction SilentlyContinue).DisplayName
  if ($name -like '*DSH Desktop*') {
    if ($DryRun) {
      Write-Host ("   [演练] 将删除注册表项 {0}（{1}）" -f $key.PSChildName, $name)
    } else {
      Write-Host ("   删除注册表项 {0}" -f $key.PSChildName)
      Remove-Item $key.PSPath -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}
# 只删本应用自己的快捷方式，文件名精确匹配，不做模糊匹配
$shortcuts = @(
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\DSH Desktop.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'DSH Desktop.lnk')
)
foreach ($link in $shortcuts) {
  [void](Remove-Target -Path $link -Label '快捷方式')
}

Write-Host '4/4 处理用户数据...'
if ($KeepData) {
  Write-Host ("   按 -KeepData 保留 {0}" -f $dataDir)
} elseif (-not (Remove-Target -Path $dataDir -Label '用户数据')) {
  Write-Host '   用户数据目录不存在，跳过'
}

Write-Host ''
if ($DryRun) {
  Write-Host '演练结束，未做任何改动。去掉 -DryRun 即可实际执行。' -ForegroundColor Yellow
} else {
  Write-Host '清理完成。' -ForegroundColor Green
}
