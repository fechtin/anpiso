const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export const driveService = {
  async getOrCreateAppFolder(accessToken: string): Promise<string> {
    const folderName = 'Anpiso';

    const searchParams = new URLSearchParams({
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
      spaces: 'drive',
    });

    const searchRes = await fetch(`${DRIVE_API}/files?${searchParams}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (searchRes.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!searchRes.ok) throw new Error(`Drive search error: ${searchRes.status}`);

    const searchData = await searchRes.json();
    if (searchData.files?.length > 0) {
      return searchData.files[0].id;
    }

    const createRes = await fetch(`${DRIVE_API}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    if (!createRes.ok) throw new Error(`Drive folder create error: ${createRes.status}`);

    const folderData = await createRes.json();
    return folderData.id;
  },

  async createMeetingFolder(
    accessToken: string,
    parentFolderId: string,
    meetingTitle: string
  ): Promise<{ id: string; webViewLink: string }> {
    const res = await fetch(`${DRIVE_API}/files?fields=id,webViewLink`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: meetingTitle,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      }),
    });
    if (res.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!res.ok) throw new Error(`Drive create folder error: ${res.status}`);
    return res.json();
  },

  async uploadAudioFile(
    accessToken: string,
    folderId: string,
    fileName: string,
    blob: Blob
  ): Promise<{ id: string; webViewLink: string }> {
    const metadata = {
      name: fileName,
      parents: [folderId],
    };

    const form = new FormData();
    form.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    );
    form.append('file', blob);

    const res = await fetch(
      `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    );
    if (res.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!res.ok) throw new Error(`Drive upload audio error: ${res.status}`);
    return res.json();
  },

  /** Đổi tên file/folder — dùng đặt lại tên folder theo tóm tắt sau khi có biên bản. */
  async renameFile(accessToken: string, fileId: string, newName: string): Promise<void> {
    const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    if (res.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!res.ok) throw new Error(`Drive rename error: ${res.status}`);
  },

  /** Tải file audio từ Drive về (dùng cho gỡ băng lại HQ). */
  async downloadFile(accessToken: string, fileId: string): Promise<Blob> {
    const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!res.ok) throw new Error(`Drive download error: ${res.status}`);
    return res.blob();
  },

  /**
   * Backup chìa khoá E2EE thành 1 file trên Drive user qua scope drive.file
   * (non-sensitive — tránh drive.appdata sensitive phải qua Google verify).
   * File hiện trong Drive user; app chỉ truy cập được file do chính nó tạo.
   */
  async saveKeyBackup(accessToken: string, fileName: string, content: string): Promise<void> {
    const searchParams = new URLSearchParams({
      q: `name='${fileName}' and trashed=false`,
      fields: 'files(id)',
    });
    const searchRes = await fetch(`${DRIVE_API}/files?${searchParams}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (searchRes.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!searchRes.ok) throw new Error(`Drive key search error: ${searchRes.status}`);
    const existing = (await searchRes.json()).files?.[0]?.id;

    let res: Response;
    if (existing) {
      res = await fetch(`${DRIVE_UPLOAD_API}/files/${existing}?uploadType=media`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'text/plain' },
        body: content,
      });
    } else {
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name: fileName })], { type: 'application/json' }));
      form.append('file', new Blob([content], { type: 'text/plain' }));
      res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
    }
    if (res.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!res.ok) throw new Error(`Drive key save error: ${res.status}`);
  },

  async loadKeyBackup(accessToken: string, fileName: string): Promise<string | null> {
    const searchParams = new URLSearchParams({
      q: `name='${fileName}' and trashed=false`,
      fields: 'files(id)',
    });
    const searchRes = await fetch(`${DRIVE_API}/files?${searchParams}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (searchRes.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!searchRes.ok) throw new Error(`Drive key search error: ${searchRes.status}`);
    const fileId = (await searchRes.json()).files?.[0]?.id;
    if (!fileId) return null;

    const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!res.ok) throw new Error(`Drive key load error: ${res.status}`);
    return res.text();
  },

  /**
   * Cấp quyền đọc file audio cho đồng nghiệp theo email khi chia sẻ cuộc họp.
   * Scope `drive.file` đủ quyền vì file audio do chính app tạo.
   * Không gửi mail thông báo — link chia sẻ của Anpiso mới là kênh thông báo.
   */
  async grantReaders(accessToken: string, fileId: string, emails: string[]): Promise<void> {
    for (const email of emails) {
      const res = await fetch(`${DRIVE_API}/files/${fileId}/permissions?sendNotificationEmail=false`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'user', emailAddress: email }),
      });
      if (res.status === 401) throw new Error('TOKEN_EXPIRED');
      // 400 khi email không phải tài khoản Google — bỏ qua người đó, đừng chặn cả link
      if (!res.ok && res.status !== 400) throw new Error(`Drive permission error: ${res.status}`);
    }
  },

  /**
   * Gỡ quyền của ĐÚNG những email được liệt kê. Không bao giờ gỡ sạch —
   * file có thể đang được user chia sẻ tay ngoài Drive, không phải việc của app.
   */
  async revokeReaders(accessToken: string, fileId: string, emails: string[]): Promise<void> {
    if (emails.length === 0) return;
    const searchParams = new URLSearchParams({ fields: 'permissions(id,role,emailAddress)' });
    const listRes = await fetch(`${DRIVE_API}/files/${fileId}/permissions?${searchParams}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (listRes.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!listRes.ok) throw new Error(`Drive permission list error: ${listRes.status}`);

    const wanted = emails.map(e => e.toLowerCase());
    const permissions: any[] = (await listRes.json()).permissions || [];
    for (const p of permissions) {
      if (p.role === 'owner') continue;
      if (!wanted.includes((p.emailAddress || '').toLowerCase())) continue;
      await fetch(`${DRIVE_API}/files/${fileId}/permissions/${p.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }
  },
};
