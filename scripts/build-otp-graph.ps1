param(
  [string]$OtpDataPath = ".\otp-data",
  [string]$JavaHeap = "8g"
)

if (!(Test-Path $OtpDataPath)) {
  New-Item -ItemType Directory -Path $OtpDataPath | Out-Null
}

$resolvedPath = (Resolve-Path $OtpDataPath).Path
Write-Host "Building OTP graph from $resolvedPath"
Write-Host "Using Java heap size $JavaHeap"
docker run --rm -e JAVA_TOOL_OPTIONS="-Xmx$JavaHeap" -v "${resolvedPath}:/var/opentripplanner" opentripplanner/opentripplanner:2.6.0 --build --save
