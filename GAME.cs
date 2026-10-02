using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Management;
using System.Threading;
using System.Windows.Forms;

public class GameForm : Form
{
    Button btnStart, btnStop;
    Label lblStatus;
    TextBox txtLog;
    CheckBox chkBrowser;
    Process nodeProc;
    bool running = false;
    string root;

    public GameForm()
    {
        root = AppDomain.CurrentDomain.BaseDirectory;
        Text = "PKM Showdown Offline - VGC 2026 Reg M-C";
        Size = new Size(720, 520);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        BackColor = Color.FromArgb(11, 16, 32);
        ForeColor = Color.White;

        var title = new Label() {
            Text = "POKEMON SHOWDOWN OFFLINE  |  VGC 2026 Reg M-C",
            Font = new Font("Segoe UI", 13, FontStyle.Bold),
            ForeColor = Color.FromArgb(255, 203, 5),
            AutoSize = true, Location = new Point(16, 12)
        };
        Controls.Add(title);

        var sub = new Label() {
            Text = "Danh voi bot OfflineBot  |  http://localhost:8080",
            Font = new Font("Segoe UI", 9),
            ForeColor = Color.FromArgb(154, 165, 196),
            AutoSize = true, Location = new Point(18, 40)
        };
        Controls.Add(sub);

        lblStatus = new Label() {
            Text = "● DANG TAT",
            Font = new Font("Segoe UI", 11, FontStyle.Bold),
            ForeColor = Color.FromArgb(255, 90, 90),
            AutoSize = true, Location = new Point(18, 66)
        };
        Controls.Add(lblStatus);

        btnStart = new Button() {
            Text = "▶  CHOI NGAY (Start)",
            Font = new Font("Segoe UI", 11, FontStyle.Bold),
            Size = new Size(220, 48), Location = new Point(16, 96),
            BackColor = Color.FromArgb(42, 117, 187), ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat
        };
        btnStart.Click += (s, e) => StartServer();
        Controls.Add(btnStart);

        btnStop = new Button() {
            Text = "■  DUNG (Stop)",
            Font = new Font("Segoe UI", 11, FontStyle.Bold),
            Size = new Size(220, 48), Location = new Point(248, 96),
            BackColor = Color.FromArgb(120, 30, 30), ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat, Enabled = false
        };
        btnStop.Click += (s, e) => StopServer();
        Controls.Add(btnStop);

        chkBrowser = new CheckBox() {
            Text = "Tu mo trinh duyet",
            Checked = true, AutoSize = true, Location = new Point(484, 112),
            ForeColor = Color.White, BackColor = Color.Transparent,
            Font = new Font("Segoe UI", 9)
        };
        Controls.Add(chkBrowser);

        txtLog = new TextBox() {
            Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical,
            Location = new Point(16, 156), Size = new Size(660, 300),
            BackColor = Color.FromArgb(8, 12, 26), ForeColor = Color.FromArgb(180, 255, 180),
            Font = new Font("Consolas", 8.5f), WordWrap = false
        };
        Controls.Add(txtLog);

        var hint = new Label() {
            Text = "Tat cua so nay = tat server. Vao game: chon ten bat ky → import team (thu muc teams) → challenge OfflineBot.",
            Font = new Font("Segoe UI", 8),
            ForeColor = Color.FromArgb(154, 165, 196),
            AutoSize = true, Location = new Point(18, 462)
        };
        Controls.Add(hint);

        FormClosing += (s, e) => { StopServer(); };
    }

    void Log(string m)
    {
        if (InvokeRequired) { Invoke(new Action<string>(Log), m); return; }
        txtLog.AppendText(m + "\r\n");
    }

    void SetRunning(bool on)
    {
        if (InvokeRequired) { Invoke(new Action<bool>(SetRunning), on); return; }
        running = on;
        btnStart.Enabled = !on;
        btnStop.Enabled = on;
        chkBrowser.Enabled = !on;
        lblStatus.Text = on ? "● DANG CHAY  (localhost:8080)" : "● DANG TAT";
        lblStatus.ForeColor = on ? Color.FromArgb(90, 255, 140) : Color.FromArgb(255, 90, 90);
    }

    void StartServer()
    {
        if (running) return;
        string nodeExe = FindNode();
        if (nodeExe == null) {
            MessageBox.Show("Chua cai Node.js! Tai o https://nodejs.org (ban LTS) roi mo lai.",
                "Thieu Node.js", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        string startJs = Path.Combine(root, "start.js");
        if (!File.Exists(startJs)) {
            MessageBox.Show("Khong thay start.js trong thu muc game!", "Loi",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        try
        {
            nodeProc = new Process();
            nodeProc.StartInfo.FileName = nodeExe;
            nodeProc.StartInfo.Arguments = "\"" + startJs + "\"";
            nodeProc.StartInfo.WorkingDirectory = root;
            nodeProc.StartInfo.UseShellExecute = false;
            nodeProc.StartInfo.CreateNoWindow = true;
            nodeProc.StartInfo.RedirectStandardOutput = true;
            nodeProc.StartInfo.RedirectStandardError = true;
            if (!chkBrowser.Checked)
                nodeProc.StartInfo.EnvironmentVariables["PS_NO_BROWSER"] = "1";
            nodeProc.OutputDataReceived += (s, e) => { if (e.Data != null) Log(e.Data); };
            nodeProc.ErrorDataReceived += (s, e) => { if (e.Data != null) Log("[ERR] " + e.Data); };
            nodeProc.EnableRaisingEvents = true;
            nodeProc.Exited += (s, e) => {
                Log("--- tien trinh game da dung ---");
                SetRunning(false);
            };
            nodeProc.Start();
            nodeProc.BeginOutputReadLine();
            nodeProc.BeginErrorReadLine();
            SetRunning(true);
            Log("=== Da bam START, dang khoi dong server + bot + web... ===");
        }
        catch (Exception ex)
        {
            MessageBox.Show("Khong chay duoc: " + ex.Message, "Loi",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    void StopServer()
    {
        // 1. Giet theo .pids (chinh xac)
        try
        {
            string pidsDir = Path.Combine(root, ".pids");
            if (Directory.Exists(pidsDir))
            {
                foreach (var f in Directory.GetFiles(pidsDir, "*.pid"))
                {
                    int pid;
                    if (int.TryParse(File.ReadAllText(f).Trim(), out pid))
                    {
                        try
                        {
                            var p = Process.GetProcessById(pid);
                            if (p.ProcessName.ToLower().Contains("node")) p.Kill();
                        }
                        catch {}
                    }
                    try { File.Delete(f); } catch {}
                }
            }
        }
        catch {}

        // 2. Quet vet theo command line
        try
        {
            string rootNorm = root.TrimEnd('\\', '/');
            using (var searcher = new ManagementObjectSearcher(
                "SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name='node.exe'"))
            {
                foreach (ManagementObject mo in searcher.Get())
                {
                    string cmd = (mo["CommandLine"] == null) ? "" : mo["CommandLine"].ToString();
                    bool mine = cmd.Contains(rootNorm)
                        || cmd.Contains("pokemon-showdown 8000")
                        || cmd.Contains("start.js") || cmd.Contains("client-server")
                        || cmd.Contains("bot\\bot.js") || cmd.Contains("bot/bot.js");
                    if (mine)
                    {
                        try { Process.GetProcessById(Convert.ToInt32(mo["ProcessId"])).Kill(); }
                        catch {}
                    }
                }
            }
        }
        catch {}

        try { if (nodeProc != null && !nodeProc.HasExited) nodeProc.Kill(); } catch {}
        nodeProc = null;
        if (running) Log("=== Da DUNG server ===");
        SetRunning(false);
    }

    static string FindNode()
    {
        // PATH
        try
        {
            var p = new Process();
            p.StartInfo.FileName = "cmd";
            p.StartInfo.Arguments = "/c where node";
            p.StartInfo.UseShellExecute = false;
            p.StartInfo.CreateNoWindow = true;
            p.StartInfo.RedirectStandardOutput = true;
            p.Start();
            string first = p.StandardOutput.ReadLine();
            p.WaitForExit(5000);
            if (!string.IsNullOrEmpty(first) && File.Exists(first.Trim())) return first.Trim();
        }
        catch {}
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string guess = Path.Combine(pf, "nodejs", "node.exe");
        if (File.Exists(guess)) return guess;
        return null;
    }

    [STAThread]
    static void Main()
    {
        // Chong chay 2 ban cung luc
        bool created;
        using (var m = new Mutex(true, "PKMShowdownOfflineVGC", out created))
        {
            if (!created)
            {
                MessageBox.Show("Game dang chay roi (kiem tra icon / cua so GAME).",
                    "GAME", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            Application.EnableVisualStyles();
            Application.Run(new GameForm());
        }
    }
}
