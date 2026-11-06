export function parsePublicGitHubUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('Enter a valid public GitHub repository URL.'); }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.port || url.username || url.password) throw new Error('Only public repositories hosted on https://github.com are supported.');
  const parts = url.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  if (parts.length !== 2) throw new Error('Use a repository URL in the form https://github.com/owner/repository.');
  const [owner, rawRepo] = parts;
  const repository = rawRepo.replace(/\.git$/i, '');
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repository)) throw new Error('Repository URL contains unsupported characters.');
  return { owner, repository, canonicalUrl: `https://github.com/${owner}/${repository}` };
}

export async function importPublicGitHubRepository() {
  const error = new Error('GitHub source retrieval is not enabled in this standalone build. No import was performed.');
  error.code = 'IMPORT_DISABLED';
  throw error;
}
