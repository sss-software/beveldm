import { cancelDownload } from '../actions';

export default function cancelDownloadThunk(id) {
  return async (dispatch, getState) => {
    let download = getState().downloads.byId[id];
    if (download.res) download.res.destroy();
    dispatch(cancelDownload(id));
  };
}
