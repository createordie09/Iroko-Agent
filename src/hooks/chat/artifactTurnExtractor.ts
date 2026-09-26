export function extractTurnArtifacts(toolExecutions: Array<{
  callId: string;
  tool: string;
  input: any;
  result?: any;
  success?: boolean;
}>): any[] {
  const turnArtifacts: any[] = [];
  for (const te of toolExecutions) {
    if (!te.success) continue;
    if ((te.tool === 'create_artifact' || te.tool === 'update_artifact') && te.result?.id) {
      turnArtifacts.push(te.result);
    } else if (te.tool === 'generate_image') {
      const d = te.result?.data || te.result;
      if (d?.artifactId || d?.id) {
        turnArtifacts.push({
          id: d.artifactId || d.id,
          name: d.filename || d.name,
          title: d.title || d.filename,
          mimeType: d.mimeType || 'image/png',
          currentVersion: 1,
          size: d.size || 0,
          metadata: {
            prompt: d.prompt || te.input?.prompt,
            model: d.model,
            seed: d.seed,
            aspectRatio: d.aspectRatio,
            revisedPrompt: d.revisedPrompt,
            isGeneratedImage: true
          }
        });
      }
    } else if (te.tool === 'create_document' || te.tool === 'register_artifact') {
      const d = te.result?.data || te.result;
      if (d?.artifactId || d?.id) {
        turnArtifacts.push({
          id: d.artifactId || d.id,
          name: d.filename || d.name,
          title: d.title || d.filename,
          mimeType: d.mimeType || 'application/octet-stream',
          currentVersion: 1,
          size: d.size || 0
        });
      }
    } else if (te.tool === 'generate_video') {
      const d = te.result?.data || te.result;
      if (d?.artifactId || d?.id) {
        turnArtifacts.push({
          id: d.artifactId || d.id,
          name: d.filename || d.name || 'video.mp4',
          title: d.title || d.filename || 'Vidéo générée',
          mimeType: d.mimeType || 'video/mp4',
          currentVersion: 1,
          size: d.size || 0,
          metadata: {
            prompt: d.prompt || te.input?.prompt,
            model: d.model,
            aspectRatio: d.aspectRatio,
            isGeneratedVideo: true
          }
        });
      }
    }
  }
  return turnArtifacts;
}
