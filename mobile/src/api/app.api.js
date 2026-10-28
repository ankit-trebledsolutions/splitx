import client from './client';

// What this build is told about updates, from the build number the client
// sends with every request (see UpdateWall):
// { platform, build, minBuild, latestBuild, latestVersion, downloadUrl, notes,
//   updateRequired, updateAvailable }
// No auth, and answered even to a build that is too old for everything else.
// A server from before force update answers 404.
export const fetchAppRelease = async () => {
  const { data } = await client.get('/app/release');
  return data.data.release;
};
