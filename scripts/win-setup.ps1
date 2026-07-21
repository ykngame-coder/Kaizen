# SUPOTSU — installation locale Windows (une seule commande).
# Usage :
#   cd E:\APPCREATION\Kaizen\supotsu
#   git pull origin claude/spot-wellness-app-r6l5bj
#   powershell -ExecutionPolicy Bypass -File .\scripts\win-setup.ps1
#
# Nécessite le "Mode développeur" Windows activé (Paramètres > Pour les
# développeurs) pour que pnpm puisse créer les liens symboliques @supotsu/*.

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot\..

Write-Host "== 1/4  Test de création de lien symbolique (ce que pnpm exige) ==" -ForegroundColor Cyan
$probe = Join-Path $env:TEMP ("supotsu_symtest_" + [guid]::NewGuid())
try {
  [void](New-Item -ItemType Junction -Path ($probe + "_j") -Target $env:TEMP -ErrorAction SilentlyContinue)
  # Le vrai test : un lien symbolique de dossier, comme pnpm.
  & node -e "const fs=require('fs'),os=require('os');const p=process.argv[1];fs.symlinkSync(os.tmpdir(),p,'dir');fs.unlinkSync(p);" $probe
  Write-Host "   OK : les liens symboliques fonctionnent (Mode developpeur actif)." -ForegroundColor Green
} catch {
  Write-Host "   ECHEC : impossible de creer un lien symbolique." -ForegroundColor Red
  Write-Host "   -> Verifie que le Mode developpeur est ACTIVE, puis rouvre PowerShell." -ForegroundColor Yellow
  throw
}

Write-Host "== 2/4  Localisation de pnpm ==" -ForegroundColor Cyan
$pnpm = (Get-Command pnpm -ErrorAction SilentlyContinue).Source
if (-not $pnpm) {
  foreach ($c in @(
      "$env:APPDATA\npm\pnpm.cmd",
      "$env:LOCALAPPDATA\pnpm\pnpm.cmd",
      "$env:LOCALAPPDATA\pnpm\pnpm.exe")) {
    if (Test-Path $c) { $pnpm = $c; break }
  }
}
if (-not $pnpm) { throw "pnpm introuvable. Installe-le avec : npm install -g pnpm" }
Write-Host "   pnpm : $pnpm" -ForegroundColor Green

Write-Host "== 3/4  Nettoyage des node_modules existants ==" -ForegroundColor Cyan
Get-ChildItem -Path . -Recurse -Directory -Filter node_modules -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty FullName |
  ForEach-Object { Write-Host "   suppression $_"; cmd /c "rmdir /s /q `"$_`"" 2>$null }

Write-Host "== 4/4  pnpm install (quelques minutes) ==" -ForegroundColor Cyan
& $pnpm install

Write-Host ""
Write-Host "TERMINE. Lance l'app avec :  pnpm --filter @supotsu/mobile start" -ForegroundColor Green
