@echo off
echo Configuration du pare-feu Windows pour l'application Quiz...
echo.

REM Ajouter une règle pour autoriser le port 3000 en entrée
netsh advfirewall firewall add rule name="Quiz App Port 3000" dir=in action=allow protocol=TCP localport=3000

if %errorlevel% equ 0 (
    echo ✅ Règle de pare-feu ajoutée avec succès !
    echo.
    echo Votre application Quiz est maintenant accessible depuis le réseau local sur :
    echo   http://192.168.1.74:3000
    echo.
) else (
    echo ❌ Erreur lors de l'ajout de la règle de pare-feu
    echo Assurez-vous d'exécuter ce script en tant qu'administrateur
    echo.
)

echo Appuyez sur une touche pour continuer...
pause >nul 