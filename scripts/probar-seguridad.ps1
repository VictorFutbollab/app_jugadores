# Pruebas de seguridad contra el proyecto real de Supabase.
#
# Uso (terminal de VS Code, en la carpeta del proyecto):
#   powershell -ExecutionPolicy Bypass -File scripts\probar-seguridad.ps1
#
# Pide la clave SECRETA (secret / service_role) de forma oculta, la usa solo en
# memoria durante la prueba y la borra al terminar. No se guarda en ningún archivo.
# El resultado queda en seguridad.log (sin claves) para revisarlo.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8 # acentos y símbolos de la salida de Node
Set-Location (Split-Path $PSScriptRoot -Parent)

$publica = ((Get-Content .env.local | Where-Object { $_ -match '^\s*VITE_SUPABASE_ANON_KEY\s*=' }) -replace '^\s*VITE_SUPABASE_ANON_KEY\s*=', '').Trim()
$url = ((Get-Content .env.local | Where-Object { $_ -match '^\s*VITE_SUPABASE_URL\s*=' }) -replace '^\s*VITE_SUPABASE_URL\s*=', '').Trim()
if (-not $publica -or -not $url) { Write-Host 'Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local' -ForegroundColor Red; exit 2 }

Write-Host ''
Write-Host 'Pega la clave SECRETA de Supabase (Project Settings > API Keys > Secret key, o service_role).' -ForegroundColor Cyan
Write-Host 'No se mostrará en pantalla ni se guardará en ningún sitio.' -ForegroundColor Cyan
$seguro = Read-Host 'Clave secreta' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
try {
  $secreta = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr).Trim()
  if (-not $secreta) { Write-Host 'No has pegado ninguna clave.' -ForegroundColor Red; exit 2 }
  if ($secreta -eq $publica) { Write-Host 'Esa es la clave pública; hace falta la secreta.' -ForegroundColor Red; exit 2 }

  $env:SUPABASE_URL = $url
  $env:SUPABASE_ANON_KEY = $publica
  $env:SUPABASE_SERVICE_ROLE_KEY = $secreta
  # En PowerShell 5 un mensaje por stderr cortaría la ejecución: aquí no debe parar nada.
  $ErrorActionPreference = 'Continue'
  node scripts/probar-seguridad.mjs | Tee-Object -FilePath seguridad.log
  $codigo = $LASTEXITCODE
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  $secreta = $null
}
Write-Host ''
if ($codigo -eq 0) { Write-Host 'Resultado guardado en seguridad.log. Avisa a Claude: "pruebas hechas".' -ForegroundColor Green }
else { Write-Host 'Hay fallos. Resultado en seguridad.log. Avisa a Claude: "pruebas hechas".' -ForegroundColor Yellow }
exit $codigo
