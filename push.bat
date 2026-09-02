@echo off
setlocal
cd /d "%~dp0"
echo Enviando as alteracoes para o GitHub (a Vercel publica a nova versao em seguida)...
echo.
git push origin master:main
if errorlevel 1 (
  echo.
  echo ATENCAO: o envio falhou. Copie a mensagem acima e me mande.
) else (
  echo.
  echo Pronto! Deploy enviado. Em cerca de 1 minuto a nova versao estara no ar.
)
echo.
pause
