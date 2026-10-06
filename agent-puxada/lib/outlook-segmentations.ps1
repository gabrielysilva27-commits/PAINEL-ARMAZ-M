param([Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop'
$messages=New-Object System.Collections.Generic.List[object]
$errors=New-Object System.Collections.Generic.List[string]
function Normalize([string]$value){return ($value.Normalize([Text.NormalizationForm]::FormD) -replace '\p{Mn}','').ToUpperInvariant()}
try {
 # Attach only to the already running classic Outlook. Never create a profile or log in.
 $outlook=[Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
 $namespace=$outlook.GetNamespace('MAPI')
 $roots=New-Object System.Collections.Generic.List[object]
 foreach($account in $namespace.Accounts){if($account.SmtpAddress -ieq 'gabrielypi@imperio1973.com'){$roots.Add($account.DeliveryStore.GetRootFolder())}}
 if($roots.Count -eq 0){foreach($store in $namespace.Stores){if($store.DisplayName -match 'gabrielypi@imperio1973.com'){$roots.Add($store.GetRootFolder())}}}
 if($roots.Count -eq 0){throw 'A caixa gabrielypi@imperio1973.com não está disponível no Outlook clássico deste usuário.'}
 function Visit($folder,[int]$depth){
  if($depth -gt 12){$errors.Add('Limite de subpastas');return}
  try {
   if($folder.DefaultItemType -eq 0){
    $items=$folder.Items
    $items.Sort('[ReceivedTime]',$true)
    for($i=1;$i -le $items.Count;$i++){
     $mail=$items.Item($i)
     if($mail.Class -ne 43){continue}
     if($mail.ReceivedTime -lt [datetime]'2026-01-01'){break}
     $subject=[string]$mail.Subject
     if((Normalize $subject) -notmatch 'SEGMENTACAO.*CLIENTES.*EMPILHADEIRA'){continue}
     if((Normalize ([string]$mail.SenderName)) -notmatch 'LUCIANO.*GOMES'){continue}
     $messages.Add(@{key=[string]$mail.EntryID;subject=$subject;received_at=$mail.ReceivedTime.ToUniversalTime().ToString('o');html=[string]$mail.HTMLBody})
     if($messages.Count -ge 3000){throw 'Limite de 3000 mensagens atingido'}
    }
   }
   foreach($child in $folder.Folders){if((Normalize ([string]$child.Name)) -notmatch '^(ITENS EXCLUIDOS|DELETED ITEMS|LIXO ELETRONICO|JUNK EMAIL|RASCUNHOS|DRAFTS|CAIXA DE SAIDA|OUTBOX|ITENS ENVIADOS|SENT ITEMS|PASTAS DE PESQUISA|SEARCH FOLDERS)$'){Visit $child ($depth+1)}}
  }catch{$errors.Add([string]$_.Exception.Message)}
 }
 foreach($root in $roots){Visit $root 0}
 $result=@{messages=@($messages.ToArray());errors=@($errors.ToArray())}
}catch{$result=@{error=[string]$_.Exception.Message;messages=@();errors=@()}}
[IO.File]::WriteAllText($OutputPath,($result|ConvertTo-Json -Depth 8 -Compress),(New-Object Text.UTF8Encoding($false)))
