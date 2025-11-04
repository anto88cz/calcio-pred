# Script per fix field names in predictions.routes.ts

$filePath = "src\routes\predictions.routes.ts"
$content = Get-Content $filePath -Raw

# 1X2 fields
$content = $content -replace 'empiricProb1:', 'prob1Empiric:'
$content = $content -replace 'empiricProbX:', 'probXEmpiric:'
$content = $content -replace 'empiricProb2:', 'prob2Empiric:'
$content = $content -replace 'poissonProb1:', 'prob1Poisson:'
$content = $content -replace 'poissonProbX:', 'probXPoisson:'
$content = $content -replace 'poissonProb2:', 'prob2Poisson:'
$content = $content -replace 'finalProb1:', 'prob1Final:'
$content = $content -replace 'finalProbX:', 'probXFinal:'
$content = $content -replace 'finalProb2:', 'prob2Final:'

# Under/Over fields
$content = $content -replace 'empiricUnder(\d+):', 'probUnder$1Empiric:'
$content = $content -replace 'empiricOver(\d+):', 'probOver$1Empiric:'
$content = $content -replace 'poissonUnder(\d+):', 'probUnder$1Poisson:'
$content = $content -replace 'poissonOver(\d+):', 'probOver$1Poisson:'
$content = $content -replace 'finalUnder(\d+):', 'probUnder$1Final:'
$content = $content -replace 'finalOver(\d+):', 'probOver$1Final:'

# BTTS fields
$content = $content -replace 'empiricBttsYes:', 'probBttsYesEmpiric:'
$content = $content -replace 'empiricBttsNo:', 'probBttsNoEmpiric:'
$content = $content -replace 'poissonBttsYes:', 'probBttsYesPoisson:'
$content = $content -replace 'poissonBttsNo:', 'probBttsNoPoisson:'
$content = $content -replace 'finalBttsYes:', 'probBttsYesFinal:'
$content = $content -replace 'finalBttsNo:', 'probBttsNoFinal:'

# Double Chance fields
$content = $content -replace 'empiric1X:', 'prob1XEmpiric:'
$content = $content -replace 'poisson1X:', 'prob1XPoisson:'
$content = $content -replace 'final1X:', 'prob1XFinal:'
$content = $content -replace 'empiric12:', 'prob12Empiric:'
$content = $content -replace 'poisson12:', 'prob12Poisson:'
$content = $content -replace 'final12:', 'prob12Final:'
$content = $content -replace 'empiricX2:', 'probX2Empiric:'
$content = $content -replace 'poissonX2:', 'probX2Poisson:'
$content = $content -replace 'finalX2:', 'probX2Final:'

Set-Content $filePath $content -NoNewline

Write-Host "✅ Field names fixed in predictions.routes.ts!"
