@echo off
setlocal
cd /d "%~dp0"
echo Registrando a nova aba "Acesso" no menu lateral...
git add public/app.js
git commit -m "Adiciona aba Acesso no menu lateral (reservada, sem regras ainda)"
if errorlevel 1 (
  echo.
  echo ATENCAO: o commit falhou ou nao havia nada novo para enviar.
  echo Copie a mensagem acima e me mande.
  echo.
  pause
  exit /b 1
)
echo.
echo Enviando para o GitHub - a Vercel publica a nova versao em seguida...
git push origin master:main
if errorlevel 1 (
  echo.
  echo ATENCAO: o envio falhou. Copie a mensagem acima e me mande.
) else (
  echo.
  echo Pronto! Deploy enviado. Em 1-2 minutos a nova versao estara no ar.
)
echo.
pause
