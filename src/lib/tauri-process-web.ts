export async function relaunch(): Promise<void> {
  window.location.reload();
}

export async function exit(_code = 0): Promise<void> {
  window.close();
}
