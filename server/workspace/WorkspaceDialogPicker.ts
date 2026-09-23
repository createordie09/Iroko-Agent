import { spawn, ChildProcess } from 'child_process';
import { WorkspaceValidator, WorkspaceValidationResult } from './WorkspaceValidator';

export interface PickFolderResult {
  cancelled: boolean;
  path?: string;
  name?: string;
  warning?: string;
  error?: string;
}

export class WorkspaceDialogPicker {
  private static instance: WorkspaceDialogPicker;
  private currentProcess: ChildProcess | null = null;
  private isPickerOpen = false;

  public static getInstance(): WorkspaceDialogPicker {
    if (!WorkspaceDialogPicker.instance) {
      WorkspaceDialogPicker.instance = new WorkspaceDialogPicker();
    }
    return WorkspaceDialogPicker.instance;
  }

  public isOpen(): boolean {
    return this.isPickerOpen;
  }

  public cancelPicker(): boolean {
    if (this.currentProcess && this.isPickerOpen) {
      try {
        if (process.platform === 'win32' && this.currentProcess.pid) {
          spawn('taskkill', ['/pid', this.currentProcess.pid.toString(), '/T', '/F']);
        } else {
          this.currentProcess.kill('SIGKILL');
        }
      } catch {}
      this.currentProcess = null;
      this.isPickerOpen = false;
      return true;
    }
    return false;
  }

  public async pickFolder(): Promise<PickFolderResult> {
    if (this.isPickerOpen) {
      return {
        cancelled: true,
        error: 'Une boîte de dialogue de sélection est déjà ouverte.'
      };
    }

    this.isPickerOpen = true;

    return new Promise((resolve) => {
      const platform = process.platform;
      let command: string;
      let args: string[];

      if (platform === 'win32') {
        command = 'powershell.exe';
        const psScript = `
          [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
          Add-Type -AssemblyName System.Windows.Forms
          $fbd = New-Object System.Windows.Forms.FolderBrowserDialog
          $fbd.Description = "Sélectionner un dossier de travail pour Iroko"
          $fbd.ShowNewFolderButton = $true
          $form = New-Object System.Windows.Forms.Form
          $form.TopMost = $true
          $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
          $form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
          $form.Show()
          $form.Activate()
          $res = $fbd.ShowDialog($form)
          $form.Dispose()
          if ($res -eq [System.Windows.Forms.DialogResult]::OK -and -not [string]::IsNullOrWhiteSpace($fbd.SelectedPath)) {
            Write-Output $fbd.SelectedPath
          } else {
            Write-Output "__CANCELLED__"
          }
        `.trim();
        args = ['-NoProfile', '-STA', '-Command', psScript];
      } else if (platform === 'darwin') {
        command = 'osascript';
        args = [
          '-e', 'try',
          '-e', 'set selectedFolder to choose folder with prompt "Sélectionner un dossier de travail pour Iroko"',
          '-e', 'return POSIX path of selectedFolder',
          '-e', 'on error',
          '-e', 'return "__CANCELLED__"',
          '-e', 'end try'
        ];
      } else {
        // Linux (zenity ou kdialog)
        command = 'zenity';
        args = ['--file-selection', '--directory', '--title=Sélectionner un dossier de travail pour Iroko'];
      }

      let stdout = '';
      let stderr = '';
      let finished = false;

      // Timeout de 5 minutes (cahier §12)
      const timeoutTimer = setTimeout(() => {
        if (!finished) {
          finished = true;
          this.cancelPicker();
          resolve({
            cancelled: true,
            error: 'Délai d\'attente dépassé (5 minutes) pour la sélection du dossier.'
          });
        }
      }, 5 * 60 * 1000);

      try {
        const child = spawn(command, args, {
          windowsHide: false,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });
        this.currentProcess = child;

        child.stdout?.on('data', (data) => {
          stdout += data.toString('utf-8');
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString('utf-8');
        });

        child.on('error', (err) => {
          if (!finished) {
            finished = true;
            clearTimeout(timeoutTimer);
            this.isPickerOpen = false;
            this.currentProcess = null;
            resolve({
              cancelled: true,
              error: `Impossible de lancer le sélecteur natif (${command}) : ${err.message}`
            });
          }
        });

        child.on('close', (code) => {
          if (!finished) {
            finished = true;
            clearTimeout(timeoutTimer);
            this.isPickerOpen = false;
            this.currentProcess = null;

            const selected = stdout.trim();
            if (!selected || selected === '__CANCELLED__' || code !== 0) {
              resolve({ cancelled: true });
              return;
            }

            // Validation serveur stricte du chemin renvoyé
            const validation = WorkspaceValidator.validate(selected);
            if (!validation.valid) {
              resolve({
                cancelled: true,
                error: validation.error || 'Dossier invalide.'
              });
              return;
            }

            resolve({
              cancelled: false,
              path: validation.canonicalPath,
              name: validation.name,
              warning: validation.warning
            });
          }
        });
      } catch (err: any) {
        clearTimeout(timeoutTimer);
        this.isPickerOpen = false;
        this.currentProcess = null;
        resolve({
          cancelled: true,
          error: `Erreur lors de l'exécution du sélecteur : ${err.message}`
        });
      }
    });
  }

  public async pickSaveFile(title = 'Enregistrer la sauvegarde Iroko', defaultName = 'iroko_backup.zip'): Promise<{ cancelled: boolean; path?: string; error?: string }> {
    if (this.isPickerOpen) {
      return { cancelled: true, error: 'Une boîte de dialogue est déjà ouverte.' };
    }
    this.isPickerOpen = true;

    return new Promise((resolve) => {
      const platform = process.platform;
      let command: string;
      let args: string[];

      if (platform === 'win32') {
        command = 'powershell.exe';
        const psScript = `
          [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
          Add-Type -AssemblyName System.Windows.Forms
          $sfd = New-Object System.Windows.Forms.SaveFileDialog
          $sfd.Title = "${title}"
          $sfd.FileName = "${defaultName}"
          $sfd.Filter = "Archive ZIP (*.zip)|*.zip|Tous les fichiers (*.*)|*.*"
          $form = New-Object System.Windows.Forms.Form
          $form.TopMost = $true
          $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
          $form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
          $form.Show()
          $form.Activate()
          $res = $sfd.ShowDialog($form)
          $form.Dispose()
          if ($res -eq [System.Windows.Forms.DialogResult]::OK -and -not [string]::IsNullOrWhiteSpace($sfd.FileName)) {
            Write-Output $sfd.FileName
          } else {
            Write-Output "__CANCELLED__"
          }
        `.trim();
        args = ['-NoProfile', '-STA', '-Command', psScript];
      } else if (platform === 'darwin') {
        command = 'osascript';
        args = [
          '-e', 'try',
          '-e', `set selectedFile to choose file name with prompt "${title}" default name "${defaultName}"`,
          '-e', 'return POSIX path of selectedFile',
          '-e', 'on error',
          '-e', 'return "__CANCELLED__"',
          '-e', 'end try'
        ];
      } else {
        command = 'zenity';
        args = ['--file-selection', '--save', `--confirm-overwrite`, `--title=${title}`, `--filename=${defaultName}`];
      }

      let stdout = '';
      let finished = false;
      const timeoutTimer = setTimeout(() => {
        if (!finished) {
          finished = true;
          this.cancelPicker();
          resolve({ cancelled: true, error: 'Délai d\'attente dépassé (5 minutes).' });
        }
      }, 5 * 60 * 1000);

      try {
        const child = spawn(command, args, { windowsHide: false, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
        this.currentProcess = child;
        child.stdout.on('data', (d) => { stdout += d.toString('utf-8'); });
        child.on('close', (code) => {
          if (!finished) {
            finished = true;
            clearTimeout(timeoutTimer);
            this.isPickerOpen = false;
            this.currentProcess = null;
            const selected = stdout.trim().split(/\r?\n/).pop()?.trim();
            if (!selected || selected === '__CANCELLED__' || code !== 0) {
              resolve({ cancelled: true });
            } else {
              resolve({ cancelled: false, path: selected });
            }
          }
        });
      } catch (err: any) {
        clearTimeout(timeoutTimer);
        this.isPickerOpen = false;
        this.currentProcess = null;
        resolve({ cancelled: true, error: err.message });
      }
    });
  }

  public async pickOpenFile(title = 'Sélectionner une sauvegarde Iroko'): Promise<{ cancelled: boolean; path?: string; error?: string }> {
    if (this.isPickerOpen) {
      return { cancelled: true, error: 'Une boîte de dialogue est déjà ouverte.' };
    }
    this.isPickerOpen = true;

    return new Promise((resolve) => {
      const platform = process.platform;
      let command: string;
      let args: string[];

      if (platform === 'win32') {
        command = 'powershell.exe';
        const psScript = `
          [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
          Add-Type -AssemblyName System.Windows.Forms
          $ofd = New-Object System.Windows.Forms.OpenFileDialog
          $ofd.Title = "${title}"
          $ofd.Filter = "Archive ZIP (*.zip)|*.zip|Tous les fichiers (*.*)|*.*"
          $form = New-Object System.Windows.Forms.Form
          $form.TopMost = $true
          $form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
          $form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
          $form.Show()
          $form.Activate()
          $res = $ofd.ShowDialog($form)
          $form.Dispose()
          if ($res -eq [System.Windows.Forms.DialogResult]::OK -and -not [string]::IsNullOrWhiteSpace($ofd.FileName)) {
            Write-Output $ofd.FileName
          } else {
            Write-Output "__CANCELLED__"
          }
        `.trim();
        args = ['-NoProfile', '-STA', '-Command', psScript];
      } else if (platform === 'darwin') {
        command = 'osascript';
        args = [
          '-e', 'try',
          '-e', `set selectedFile to choose file with prompt "${title}" of type {"zip"}`,
          '-e', 'return POSIX path of selectedFile',
          '-e', 'on error',
          '-e', 'return "__CANCELLED__"',
          '-e', 'end try'
        ];
      } else {
        command = 'zenity';
        args = ['--file-selection', `--title=${title}`, '--file-filter=*.zip'];
      }

      let stdout = '';
      let finished = false;
      const timeoutTimer = setTimeout(() => {
        if (!finished) {
          finished = true;
          this.cancelPicker();
          resolve({ cancelled: true, error: 'Délai d\'attente dépassé (5 minutes).' });
        }
      }, 5 * 60 * 1000);

      try {
        const child = spawn(command, args, { windowsHide: false, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
        this.currentProcess = child;
        child.stdout.on('data', (d) => { stdout += d.toString('utf-8'); });
        child.on('close', (code) => {
          if (!finished) {
            finished = true;
            clearTimeout(timeoutTimer);
            this.isPickerOpen = false;
            this.currentProcess = null;
            const selected = stdout.trim().split(/\r?\n/).pop()?.trim();
            if (!selected || selected === '__CANCELLED__' || code !== 0) {
              resolve({ cancelled: true });
            } else {
              resolve({ cancelled: false, path: selected });
            }
          }
        });
      } catch (err: any) {
        clearTimeout(timeoutTimer);
        this.isPickerOpen = false;
        this.currentProcess = null;
        resolve({ cancelled: true, error: err.message });
      }
    });
  }
}

export const workspaceDialogPicker = WorkspaceDialogPicker.getInstance();
