# Cuenta de PRUEBA para revisar la app por dentro (no se envía ningún correo).
#
#   Crear:  powershell -ExecutionPolicy Bypass -File scripts\cuenta-prueba.ps1
#   Borrar: powershell -ExecutionPolicy Bypass -File scripts\cuenta-prueba.ps1 -Borrar
#
# Crea claude.pruebas@futbollab.com, ya confirmada y con rol admin, y guarda el email y
# una contraseña aleatoria en .cuenta-prueba.local (ignorado por git). Pide la clave
# SECRETA de Supabase de forma oculta y no la guarda en ningún sitio.
param([switch]$Borrar)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Split-Path $PSScriptRoot -Parent)

$url = ((Get-Content .env.local | Where-Object { $_ -match '^\s*VITE_SUPABASE_URL\s*=' }) -replace '^\s*VITE_SUPABASE_URL\s*=', '').Trim()
if (-not $url) { Write-Host 'Falta VITE_SUPABASE_URL en .env.local' -ForegroundColor Red; exit 2 }

Write-Host ''
Write-Host 'Pega la clave SECRETA de Supabase (Secret key o service_role). No se verá ni se guardará.' -ForegroundColor Cyan
$seguro = Read-Host 'Clave secreta' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
try {
  $secreta = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr).Trim()
  $env:SUPABASE_URL = $url
  $env:SUPABASE_SERVICE_ROLE_KEY = $secreta
  $ErrorActionPreference = 'Continue'
  if ($Borrar) { node scripts/cuenta-prueba.mjs borrar } else { node scripts/cuenta-prueba.mjs crear }
  $codigo = $LASTEXITCODE
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  $secreta = $null
}
exit $codigo
