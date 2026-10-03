import { ArtifactPublicInfo } from '../../services/artifacts/ArtifactService';

/** Intègre un artéfact créé ou mis à jour (événement d'agent) à la liste des artéfacts de la discussion */
export function mergeArtifactEvent(
  prev: ArtifactPublicInfo[],
  artifact: { id: string; name: string; title?: string; mimeType: string; version: number; size: number },
  conversationId: string
): ArtifactPublicInfo[] {
  const now = new Date().toISOString();
  const existingIdx = prev.findIndex(a => a.id === artifact.id);
  if (existingIdx >= 0) {
    const copy = [...prev];
    copy[existingIdx] = {
      ...copy[existingIdx],
      name: artifact.name,
      title: artifact.title || copy[existingIdx].title,
      mimeType: artifact.mimeType,
      currentVersion: artifact.version,
      size: artifact.size,
      updatedAt: now
    };
    return copy;
  }
  const created: ArtifactPublicInfo = {
    id: artifact.id,
    name: artifact.name,
    title: artifact.title || artifact.name,
    mimeType: artifact.mimeType,
    currentVersion: artifact.version,
    size: artifact.size,
    conversationId: conversationId || '',
    createdAt: now,
    updatedAt: now,
    versions: [
      {
        id: 'ver_' + artifact.version,
        artifactId: artifact.id,
        version: artifact.version,
        size: artifact.size,
        filePath: '',
        createdAt: now
      }
    ]
  };
  return [created, ...prev];
}
