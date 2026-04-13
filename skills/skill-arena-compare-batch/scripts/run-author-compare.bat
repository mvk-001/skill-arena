@echo off
setlocal
node "%~dp0run-author-compare.js" %*
exit /b %ERRORLEVEL%
