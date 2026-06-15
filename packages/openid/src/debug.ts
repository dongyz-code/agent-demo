// import { randomUUID } from 'node:crypto';
// import { useOAuth2 } from './index.js';

// const { buildAuthorizationUrl, authorizationCodeGrant, fetchUserInfo } =
//   useOAuth2({
//     configs: {

//     },
//   });

// console.time('END');
// (async () => {
//   const url = await buildAuthorizationUrl();
//   console.log(url);

//   const tokens = await authorizationCodeGrant({
//     url: 'https://ai-deploy.medomino.com/login?code=5b051e52b8780f5177a3&state=Casdoor',
//     state: 'Casdoor',
//   });
//   console.log(tokens);
//   console.log(await fetchUserInfo(tokens));
// })()
//   .then(() => {
//     console.timeEnd('END');
//     process.exit(0);
//   })
//   .catch((error) => {
//     console.error(error);
//     console.timeEnd('END');
//     process.exit(1);
//   });
