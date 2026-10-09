/** Returns the folder that holds one project's files. */
export function projectDir(projectId: string): string {
  return `projects/${projectId}`;
}

/** Returns the OPFS path of an imported media file. */
export function mediaPath(projectId: string, assetId: string, ext: string): string {
  return `projects/${projectId}/media/${assetId}.${ext}`;
}

/** Returns the folder where thumbnails of one asset are stored. */
export function thumbDir(projectId: string, assetId: string): string {
  return `projects/${projectId}/thumbs/${assetId}`;
}

/** Splits a path on '/' and drops empty segments. */
export function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

/** Returns the lowercase extension of a file name without the dot, or '' when there is none. */
export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) {
    return '';
  }
  return fileName.slice(dot + 1).toLowerCase();
}
