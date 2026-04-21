$env:ANTHROPIC_AUTH_TOKEN="ollama"
$env:ANTHROPIC_API_KEY=""
$env:ANTHROPIC_BASE_URL="http://localhost:11434"

Write-Host "Launching Claude Code against local Ollama gemma4:e4b..."
claude --model gemma4:e4b
