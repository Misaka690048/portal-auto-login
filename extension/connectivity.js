// Microsoft NCSI's public connectivity probe. No campus credentials or cookies.
export const PROBE_URL='http://www.msftconnecttest.com/connecttest.txt';
export async function internetReachable(){
  try {
    const response=await fetch(PROBE_URL,{
      credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
      signal:AbortSignal.timeout(1500)
    });
    return response.status===200 && !response.redirected &&
      (await response.text()).trim()==='Microsoft Connect Test';
  } catch { return false; }
}
