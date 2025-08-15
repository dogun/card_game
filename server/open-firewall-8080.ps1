param(
  [int]$Port = 8080,
  [string]$RuleName = "CardGame Server TCP"
)

Write-Host "Adding firewall rule for TCP port $Port ..." -ForegroundColor Cyan
# 添加入站规则（若已存在则先删除再添加）
$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Existing rule found, removing..." -ForegroundColor Yellow
  $existing | Remove-NetFirewallRule
}
New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port | Out-Null
Write-Host "Done." -ForegroundColor Green