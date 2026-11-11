/**
 * Windows groups and pins taskbar buttons by AppUserModelID. ODAK runs in a
 * Chrome app window, so without its own ID the taskbar treats it as Chrome:
 * pinning the running window pins Chrome, which cannot reopen ODAK. The same
 * IDs are written to the running windows (with a relaunch command, name and
 * icon for pinning) and to the shortcuts the package installs, so a pinned
 * button, a shortcut and an open ODAK window share one taskbar button.
 */
export const TASKBAR_IDS = Object.freeze({
  main: "ODAK.Takip.Ana",
  widget: "ODAK.Takip.Widget",
});

/** C# helper compiled by Add-Type; needs the System and InteropServices usings. */
export function taskbarIdentityType() {
  return `public static class OdakTaskbar {
[StructLayout(LayoutKind.Sequential,Pack=4)] public struct Key { public Guid Format; public uint Id; public Key(uint id) { Format=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"); Id=id; } }
[StructLayout(LayoutKind.Explicit)] public struct Value { [FieldOffset(0)] public ushort Type; [FieldOffset(8)] public IntPtr Text; [FieldOffset(16)] public IntPtr Spare; }
[ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IStore { [PreserveSig] int GetCount(out uint count); [PreserveSig] int GetAt(uint index,out Key key); [PreserveSig] int GetValue(ref Key key,out Value value); [PreserveSig] int SetValue(ref Key key,ref Value value); [PreserveSig] int Commit(); }
[DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr h,ref Guid iid,[MarshalAs(UnmanagedType.Interface)] out IStore store);
[DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern int SHGetPropertyStoreFromParsingName(string path,IntPtr bind,int flags,ref Guid iid,[MarshalAs(UnmanagedType.Interface)] out IStore store);
static Guid StoreId=new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
static readonly HashSet<IntPtr> Tagged=new HashSet<IntPtr>();
static void Set(IStore store,uint id,string text) {
  var key=new Key(id); var value=new Value(); value.Type=31; value.Text=Marshal.StringToCoTaskMemUni(text);
  try { int hr=store.SetValue(ref key,ref value); if(hr<0) Marshal.ThrowExceptionForHR(hr); } finally { Marshal.FreeCoTaskMem(value.Text); }
}
// ID first, then the relaunch details Windows uses when this window is pinned.
public static bool Tag(IntPtr h,string appId,string command,string name,string icon) {
  if(h==IntPtr.Zero || Tagged.Contains(h)) return false;
  IStore store=null;
  try {
    if(SHGetPropertyStoreForWindow(h,ref StoreId,out store)<0 || store==null) return false;
    Set(store,5,appId); Set(store,3,icon); Set(store,2,command); Set(store,4,name); store.Commit();
    Tagged.Add(h); return true;
  } catch { return false; }
  finally { if(store!=null) Marshal.ReleaseComObject(store); }
}
public static void Forget(IntPtr h) { Tagged.Remove(h); }
public static void TagShortcut(string path,string appId) {
  IStore store=null;
  int hr=SHGetPropertyStoreFromParsingName(path,IntPtr.Zero,2,ref StoreId,out store);
  if(hr<0) Marshal.ThrowExceptionForHR(hr);
  try { Set(store,5,appId); hr=store.Commit(); if(hr<0) Marshal.ThrowExceptionForHR(hr); }
  finally { Marshal.ReleaseComObject(store); }
}
}`;
}
