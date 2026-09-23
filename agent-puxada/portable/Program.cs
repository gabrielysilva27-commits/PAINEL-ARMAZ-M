using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32;

namespace AgentePuxadaPortable;

internal static class Program
{
    private const string RunKeyName = "AgentePuxadaPromax";
    private const string MutexName = @"Local\AgentePuxadaPromax";

    private static string BaseDir => AppContext.BaseDirectory;
    private static string DataDir => Path.Combine(BaseDir, "data");
    private static string TokenPath => Path.Combine(DataDir, "agent-token.dat");
    private static string NodePath => Path.Combine(BaseDir, "runtime", "node.exe");
    private static string AgentPath => Path.Combine(BaseDir, "app", "agent.js");

    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Contains("--get-token", StringComparer.OrdinalIgnoreCase))
        {
            try { Console.Out.Write(ReadToken()); } catch { }
            return;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        if (args.Contains("--background", StringComparer.OrdinalIgnoreCase))
        {
            RunBackground();
            return;
        }

        if (args.Contains("--calibrate", StringComparer.OrdinalIgnoreCase))
        {
            RunCalibration();
            return;
        }

        if (!File.Exists(TokenPath))
        {
            if (!ShowSetup()) return;
        }

        ShowControl();
    }

    private static byte[] Protect(string text)
    {
        return ProtectedData.Protect(Encoding.UTF8.GetBytes(text), null, DataProtectionScope.CurrentUser);
    }

    private static string Unprotect(byte[] bytes)
    {
        return Encoding.UTF8.GetString(ProtectedData.Unprotect(bytes, null, DataProtectionScope.CurrentUser));
    }

    private static void SaveToken(string token)
    {
        Directory.CreateDirectory(DataDir);
        File.WriteAllBytes(TokenPath, Protect(token.Trim()));
    }

    private static string ReadToken()
    {
        if (!File.Exists(TokenPath)) return string.Empty;
        return Unprotect(File.ReadAllBytes(TokenPath)).Trim();
    }

    private static void SetAutoStart(bool enabled)
    {
        using var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
        if (enabled)
            key.SetValue(RunKeyName, "\"" + Application.ExecutablePath + "\" --background");
        else
            key.DeleteValue(RunKeyName, false);
    }

    private static bool AutoStartEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
        return key?.GetValue(RunKeyName) is string value &&
               value.Contains(Path.GetFileName(Application.ExecutablePath), StringComparison.OrdinalIgnoreCase);
    }

    private static bool ShowSetup()
    {
        using var form = new Form
        {
            Text = "Configurar Agente Puxada",
            Width = 560,
            Height = 315,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            StartPosition = FormStartPosition.CenterScreen
        };

        var title = new Label { Left = 24, Top = 20, Width = 490, Height = 28, Text = "Agente Puxada · Promax", Font = new Font("Segoe UI", 14, FontStyle.Bold) };
        var info = new Label
        {
            Left = 24, Top = 57, Width = 495, Height = 50,
            Text = "No Painel Armazém, abra ADM → Agente Puxada e copie o token do computador correto. Cada PC usa seu próprio token."
        };
        var tokenLabel = new Label { Left = 24, Top = 116, Width = 180, Height = 20, Text = "Token deste computador" };
        var tokenBox = new TextBox { Left = 24, Top = 139, Width = 495, Height = 28, UseSystemPasswordChar = true };
        var showToken = new CheckBox { Left = 24, Top = 176, Width = 130, Text = "Mostrar token" };
        var autoStart = new CheckBox { Left = 170, Top = 176, Width = 260, Text = "Iniciar automaticamente com o Windows", Checked = true };
        var save = new Button { Left = 350, Top = 218, Width = 168, Height = 34, Text = "Salvar e continuar" };
        var cancel = new Button { Left = 24, Top = 218, Width = 110, Height = 34, Text = "Cancelar" };

        showToken.CheckedChanged += (_, _) => tokenBox.UseSystemPasswordChar = !showToken.Checked;
        cancel.Click += (_, _) => form.DialogResult = DialogResult.Cancel;
        save.Click += (_, _) =>
        {
            var token = tokenBox.Text.Trim();
            if (!token.StartsWith("pa_", StringComparison.Ordinal) || token.Length < 20)
            {
                MessageBox.Show("Cole o token gerado no ADM para este computador.", "Token inválido", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            try
            {
                SaveToken(token);
                if (autoStart.Checked)
                {
                    try
                    {
                        SetAutoStart(true);
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show(
                            "O token foi salvo, mas a política do computador não permitiu configurar a inicialização automática.\n\n" +
                            "Você ainda pode usar o agente abrindo AgentePuxada.exe com dois cliques.\n\n" + ex.Message,
                            "Inicialização automática bloqueada",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Warning
                        );
                    }
                }
                else
                {
                    try { SetAutoStart(false); } catch { }
                }
                form.DialogResult = DialogResult.OK;
            }
            catch (Exception ex)
            {
                MessageBox.Show("Não foi possível salvar a configuração.\n\n" + ex.Message, "Agente Puxada", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        };

        form.Controls.AddRange(new Control[] { title, info, tokenLabel, tokenBox, showToken, autoStart, save, cancel });
        return form.ShowDialog() == DialogResult.OK;
    }

    private static void ShowControl()
    {
        using var form = new Form
        {
            Text = "Agente Puxada",
            Width = 520,
            Height = 300,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            StartPosition = FormStartPosition.CenterScreen
        };

        var title = new Label { Left = 24, Top = 20, Width = 440, Height = 30, Text = "Agente Puxada · Promax", Font = new Font("Segoe UI", 14, FontStyle.Bold) };
        var status = new Label
        {
            Left = 24, Top = 63, Width = 450, Height = 52,
            Text = "Computador configurado.\nO status operacional aparece no Painel Armazém."
        };
        var start = new Button { Left = 24, Top = 133, Width = 145, Height = 38, Text = "Iniciar agente" };
        var calibrate = new Button { Left = 182, Top = 133, Width = 145, Height = 38, Text = "Abrir Promax" };
        var configure = new Button { Left = 340, Top = 133, Width = 145, Height = 38, Text = "Trocar token" };
        var autoStart = new CheckBox { Left = 24, Top = 193, Width = 300, Text = "Iniciar automaticamente com o Windows", Checked = AutoStartEnabled() };
        var close = new Button { Left = 375, Top = 205, Width = 110, Height = 32, Text = "Fechar" };

        start.Click += (_, _) =>
        {
            StartSelf("--background");
            MessageBox.Show("O Agente Puxada foi iniciado. Acompanhe o status pelo Painel.", "Agente Puxada", MessageBoxButtons.OK, MessageBoxIcon.Information);
        };

        calibrate.Click += (_, _) =>
        {
            StartSelf("--calibrate");
            MessageBox.Show("O Microsoft Edge normal será aberto. Faça login no Promax e mantenha a sessão aberta. A automação usa o Modo Internet Explorer, sem depuração remota.", "Abrir Promax", MessageBoxButtons.OK, MessageBoxIcon.Information);
        };

        configure.Click += (_, _) => ShowSetup();
        autoStart.CheckedChanged += (_, _) =>
        {
            try { SetAutoStart(autoStart.Checked); }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Agente Puxada", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        };
        close.Click += (_, _) => form.Close();

        form.Controls.AddRange(new Control[] { title, status, start, calibrate, configure, autoStart, close });
        form.ShowDialog();
    }

    private static void StartSelf(string argument)
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = Application.ExecutablePath,
            Arguments = argument,
            UseShellExecute = true
        });
    }

    private static ProcessStartInfo NodeStartInfo(string args, bool hidden)
    {
        if (!File.Exists(NodePath))
            throw new FileNotFoundException("Runtime do agente não encontrado.", NodePath);
        if (!File.Exists(AgentPath))
            throw new FileNotFoundException("Aplicação do agente não encontrada.", AgentPath);

        var psi = new ProcessStartInfo
        {
            FileName = NodePath,
            Arguments = "\"" + AgentPath + "\" " + args,
            WorkingDirectory = Path.Combine(BaseDir, "app"),
            UseShellExecute = false,
            CreateNoWindow = hidden,
            WindowStyle = hidden ? ProcessWindowStyle.Hidden : ProcessWindowStyle.Normal
        };
        psi.Environment["AGENTE_PUXADA_LAUNCHER"] = Application.ExecutablePath;
        return psi;
    }

    private static void RunBackground()
    {
        if (!File.Exists(TokenPath)) return;

        using var mutex = new Mutex(true, MutexName, out var createdNew);
        if (!createdNew) return;

        try
        {
            using var process = Process.Start(NodeStartInfo("", true));
            process?.WaitForExit();
        }
        catch (Exception ex)
        {
            File.AppendAllText(Path.Combine(DataDir, "launcher-error.log"), DateTime.Now + " " + ex + Environment.NewLine);
        }
        finally
        {
            try { mutex.ReleaseMutex(); } catch { }
        }
    }

    private static void RunCalibration()
    {
        if (!File.Exists(TokenPath))
        {
            if (!ShowSetup()) return;
        }

        try
        {
            using var process = Process.Start(NodeStartInfo("--calibrate", true));
            process?.WaitForExit();
        }
        catch (Exception ex)
        {
            MessageBox.Show("Não foi possível abrir a calibração.\n\n" + ex.Message, "Agente Puxada", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
