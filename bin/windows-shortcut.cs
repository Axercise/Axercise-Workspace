using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

namespace Axercise {
    // IShellLinkW preserves Unicode paths and arguments in Windows shortcuts.
    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    internal class ShellLink { }

    [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IShellLinkW {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int length, IntPtr findData, uint flags);
        void GetIDList(out IntPtr idList);
        void SetIDList(IntPtr idList);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder description, int length);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string description);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder directory, int length);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string directory);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder arguments, int length);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string arguments);
        void GetHotkey(out short hotkey);
        void SetHotkey(short hotkey);
        void GetShowCmd(out int command);
        void SetShowCmd(int command);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder icon, int length, out int index);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string icon, int index);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
        void Resolve(IntPtr window, uint flags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
    }

    public class StartupShortcutInfo {
        public string TargetPath;
        public string Arguments;
        public string WorkingDirectory;
        public string Description;
        public int WindowStyle;
    }

    public static class StartupShortcut {
        public static StartupShortcutInfo Read(string filename) {
            object instance = new ShellLink();
            try {
                ((IPersistFile)instance).Load(filename, 0);
                var link = (IShellLinkW)instance;
                var target = new StringBuilder(32768);
                var arguments = new StringBuilder(32768);
                var directory = new StringBuilder(32768);
                var description = new StringBuilder(1024);
                int style;
                link.GetPath(target, target.Capacity, IntPtr.Zero, 0);
                link.GetArguments(arguments, arguments.Capacity);
                link.GetWorkingDirectory(directory, directory.Capacity);
                link.GetDescription(description, description.Capacity);
                link.GetShowCmd(out style);
                return new StartupShortcutInfo { TargetPath = target.ToString(), Arguments = arguments.ToString(), WorkingDirectory = directory.ToString(), Description = description.ToString(), WindowStyle = style };
            } finally { Marshal.FinalReleaseComObject(instance); }
        }

        public static void Write(string filename, string target, string arguments, string directory, string description, string icon) {
            object instance = new ShellLink();
            try {
                var link = (IShellLinkW)instance;
                link.SetPath(target);
                link.SetArguments(arguments);
                link.SetWorkingDirectory(directory);
                link.SetDescription(description);
                link.SetShowCmd(7);
                link.SetIconLocation(icon, 0);
                ((IPersistFile)instance).Save(filename, true);
            } finally { Marshal.FinalReleaseComObject(instance); }
        }
    }
}
