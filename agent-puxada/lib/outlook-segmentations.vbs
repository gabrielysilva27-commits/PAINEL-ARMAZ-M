Option Explicit
Dim outputPath, outlook, ns, root, account, store, messages, errors, total, fatal, targets
targets = ""
If WScript.Arguments.Count > 1 Then targets = WScript.Arguments(1)
outputPath = WScript.Arguments(0)
messages = "" : errors = "" : total = 0 : fatal = ""
Function Json(value)
 Dim t
 t = CStr(value)
 t = Replace(t, "\", "\\")
 t = Replace(t, Chr(34), "\" & Chr(34))
 t = Replace(t, vbCr, "\r")
 t = Replace(t, vbLf, "\n")
 t = Replace(t, vbTab, "\t")
 Json = Chr(34) & t & Chr(34)
End Function
Function IsoUtc(value)
 ' Date conversion is performed by Outlook PropertyAccessor in UTC.
 IsoUtc = Year(value) & "-" & Right("0" & Month(value),2) & "-" & Right("0" & Day(value),2) & "T" & Right("0" & Hour(value),2) & ":" & Right("0" & Minute(value),2) & ":" & Right("0" & Second(value),2) & "Z"
End Function
Sub Stage(value)
 On Error Resume Next
 Dim file, sys
 Set sys = CreateObject("Scripting.FileSystemObject")
 Set file = sys.CreateTextFile(outputPath & ".stage", True)
 file.Write value & "; mensagens=" & CStr(total)
 file.Close
 Err.Clear
End Sub
Sub AddError(value)
 If errors <> "" Then errors = errors & ","
 errors = errors & Json(value)
End Sub
Function Wanted(subject)
 Dim regex, matches, item, date
 Wanted = False
 Set regex = New RegExp
 regex.Pattern = "([0-9]{2})[/.-]([0-9]{2})[/.-](2026)"
 Set matches = regex.Execute(subject)
 If matches.Count = 0 Then Exit Function
 Set item = matches(0)
 date = item.SubMatches(2) & "-" & item.SubMatches(1) & "-" & item.SubMatches(0)
 Wanted = InStr("," & targets & ",", "," & date & ",") > 0
End Function
Sub Visit(folder, depth)
 On Error Resume Next
 Dim items, mail, child, i, subject, sender, received, utc, entry, html, folderName
 If depth > 12 Or total >= 3000 Then Exit Sub
 If folder.DefaultItemType = 0 Then
  Stage "filtrando pasta"
  Set items = folder.Items.Restrict("@SQL=" & Chr(34) & "urn:schemas:httpmail:subject" & Chr(34) & " like '%EMPILHADEIRA%'")
  If Err.Number <> 0 Then
   Err.Clear
   Set items = folder.Items
  End If
  Stage "ordenando pasta"
  items.Sort "[ReceivedTime]", True
  If Err.Number <> 0 Then
   AddError "Nao foi possivel acessar uma pasta de e-mails."
   Err.Clear
  Else
   For i = 1 To items.Count
    Stage "lendo mensagem " & CStr(i) & "/" & CStr(items.Count)
    Set mail = items.Item(i)
    If Err.Number = 0 Then
     If mail.Class = 43 Then
      received = mail.ReceivedTime
      If received < DateSerial(2026,1,1) Then Exit For
      subject = UCase(CStr(mail.Subject))
      If Wanted(subject) And InStr(subject,"SEGMENTA") > 0 And InStr(subject,"CLIENTES") > 0 And InStr(subject,"EMPILHADEIRA") > 0 Then
       sender = UCase(CStr(mail.SenderName))
       If InStr(sender,"LUCIANO") > 0 And InStr(sender,"GOMES") > 0 Then
        entry = CStr(mail.EntryID)
        Stage "lendo tabela de segmentacao"
        html = CStr(mail.HTMLBody)
        utc = mail.PropertyAccessor.LocalTimeToUTC(received)
        If Err.Number = 0 Then
         If messages <> "" Then messages = messages & ","
         messages = messages & "{" & Json("key") & ":" & Json(entry) & "," & Json("subject") & ":" & Json(mail.Subject) & "," & Json("received_at") & ":" & Json(IsoUtc(utc)) & "," & Json("html") & ":" & Json(html) & "}"
         total = total + 1
         If total >= 3000 Then AddError "Limite de mensagens atingido" : Exit For
        Else
         AddError "Nao foi possivel ler uma mensagem de segmentacao."
        End If
       End If
      End If
     End If
    End If
    Err.Clear
   Next
  End If
 End If
 Err.Clear
 For Each child In folder.Folders
  folderName = Replace(Replace(UCase(CStr(child.Name)),ChrW(205),"I"),ChrW(212),"O")
  If folderName <> "ITENS EXCLUIDOS" And folderName <> "DELETED ITEMS" And folderName <> "LIXO ELETRONICO" And folderName <> "JUNK EMAIL" And folderName <> "RASCUNHOS" And folderName <> "DRAFTS" And folderName <> "CAIXA DE SAIDA" And folderName <> "OUTBOX" And folderName <> "ITENS ENVIADOS" And folderName <> "SENT ITEMS" And folderName <> "PASTAS DE PESQUISA" And folderName <> "SEARCH FOLDERS" Then Visit child, depth+1
 Next
 If Err.Number <> 0 Then AddError "Nao foi possivel acessar uma subpasta."
 Err.Clear
End Sub
On Error Resume Next
Stage "conectando ao Outlook classico"
Set outlook = GetObject(, "Outlook.Application")
If Err.Number <> 0 Then
 fatal = "Outlook classico nao disponivel para o usuario do agente (" & CStr(Err.Number) & ")."
 Err.Clear
Else
 Stage "acessando caixa MAPI"
 Set ns = outlook.GetNamespace("MAPI")
 Set root = Nothing
 Stage "localizando conta"
 For Each account In ns.Accounts
  If LCase(CStr(account.SmtpAddress)) = "gabrielypi@imperio1973.com" Then Set root = account.DeliveryStore.GetRootFolder() : Exit For
 Next
 If root Is Nothing Then
  For Each store In ns.Stores
   If InStr(LCase(CStr(store.DisplayName)),"gabrielypi@imperio1973.com") > 0 Then Set root = store.GetRootFolder() : Exit For
  Next
 End If
 If root Is Nothing Then
  fatal = "A caixa gabrielypi@imperio1973.com nao esta disponivel no Outlook classico deste usuario."
 Else
  Stage "buscando pastas"
  Visit root, 0
 End If
End If
Dim stream, result
result = "{" & Json("messages") & ":[" & messages & "]," & Json("errors") & ":[" & errors & "]"
If fatal <> "" Then result = result & "," & Json("error") & ":" & Json(fatal)
result = result & "}"
Err.Clear
Stage "salvando resultado"
Set stream = CreateObject("ADODB.Stream")
stream.Type = 2 : stream.Charset = "utf-8" : stream.Open
stream.WriteText result
stream.SaveToFile outputPath, 2
If Err.Number <> 0 Then WScript.Quit 2
stream.Close
WScript.Quit 0
