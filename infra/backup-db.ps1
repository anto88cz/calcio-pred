# Backup script per database PostgreSQL
# Usage: .\backup-db.ps1

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "backup_$timestamp.sql"

Write-Host "🔄 Creating database backup: $backupFile" -ForegroundColor Cyan

docker exec calciopred-postgres pg_dump -U calciopred calciopred > $backupFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backup completed successfully: $backupFile" -ForegroundColor Green
    
    # Comprimi il backup
    Compress-Archive -Path $backupFile -DestinationPath "$backupFile.zip"
    Remove-Item $backupFile
    
    Write-Host "📦 Compressed backup: $backupFile.zip" -ForegroundColor Green
} else {
    Write-Host "❌ Backup failed!" -ForegroundColor Red
    exit 1
}
