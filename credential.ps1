param([Parameter(Mandatory = $true)][ValidateSet('Save', 'Read')][string]$Mode)
$ErrorActionPreference = 'Stop'
$keyDirectory = Join-Path $env:LOCALAPPDATA 'claude-ab'
$keyFile = Join-Path $keyDirectory 'api-key.dpapi'
$stage = 'opening the credential prompt'
try {
    if ($Mode -eq 'Save') {
        Write-Host 'Paste your Abliteration project API key (ak_...). Input is hidden.'
        $secureKey = Read-Host 'API key' -AsSecureString
        $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
        try {
            $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer).Trim()
            if ($plainKey -notmatch '^ak_\S+$') {
                [Console]::Error.WriteLine('The pasted value is not an ak_ project API key. Copy the key value alone from the Abliteration console, without quotes.')
                exit 1
            }
            $secureKey = ConvertTo-SecureString -String $plainKey -AsPlainText -Force
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
            $plainKey = $null
        }
        $stage = 'creating the credential directory'
        New-Item -ItemType Directory -Path $keyDirectory -Force | Out-Null
        $stage = 'encrypting the key with Windows DPAPI'
        $encryptedKey = ConvertFrom-SecureString -SecureString $secureKey
        $stage = 'saving the encrypted key'
        [IO.File]::WriteAllText($keyFile, $encryptedKey)
        Write-Host 'Key saved with Windows account encryption. Run: claude-ab --check'
    } else {
        $stage = 'decrypting the saved key for this Windows account'
        $secureKey = ConvertTo-SecureString -String ([IO.File]::ReadAllText($keyFile))
        $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
        try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer) }
    }
    exit 0
} catch {
    # Do not print exception details that could contain credential material.
    [Console]::Error.WriteLine(('Credential operation failed while {0}. Error type: {1}; code: {2}. No key value has been logged.' -f $stage, $_.Exception.GetType().Name, $_.Exception.HResult))
    exit 1
}
