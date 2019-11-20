import {
  resumingDownload,
  resumeDownload,
  updateBytesDownloaded,
  downloadError,
  changeDownloadBasicInfo
} from '../actions';
import { httpGetPromise } from '../promisified';
import {
  getAvailableFilename,
  getPartialDownloadPath,
  deleteFile
} from './helpers';
import fs from 'fs';
import { getFilename, getFileSize } from './helpers';
import thunkDownloadFile from './download-file';

export default function thunkResumeDownload(id) {
  return async (dispatch, getState) => {
    const downloads = getState().downloads;
    let download = downloads.find(download => download.id === id);
    if (download.status === 'resuming') return;

    if (download.res) {
      dispatch(resumingDownload(id));
      download.res.resume();
      dispatch(resumeDownload(id, download.res));
    } else if (download.status === 'error') {
      dispatch(thunkResumeFromError(id, download.error.code));
    } else {
      dispatch(resumingDownload(id));
      const fullpath = getPartialDownloadPath(download);
      const res = await httpGetPromise(download.url, {
        headers: {
          Range: `bytes=${download.bytesDownloaded}-`,
          Connection: 'keep-alive'
        }
      });
      const filename = getFilename(download.url, res.headers);
      const size = getFileSize(res.headers);
      if (download.filename !== filename || download.size !== size)
        dispatch(downloadError(id, { code: 'ERR_FILE_CHANGED' }));
      else {
        let stream;
        if (!download.resumable) {
          dispatch(updateBytesDownloaded(id, 0));
          stream = fs.createWriteStream(fullpath);
        } else stream = fs.createWriteStream(fullpath, { flags: 'a' });
        // The download status might have changed since dispatching resumingDownload
        download = getState().downloads.find(download => download.id === id);
        if (download.status === 'resuming') {
          dispatch(resumeDownload(id, res));
          dispatch(thunkDownloadFile(id, res, stream));
        }
      }
    }
    return Promise.resolve();
  };
}

function thunkResumeFromError(id, code) {
  return async (dispatch, getState) => {
    dispatch(resumingDownload(id));
    let res, stream;
    const downloads = getState().downloads;
    let download = downloads.find(download => download.id === id);
    switch (code) {
      case 'ERR_FILE_CHANGED':
        let fullpath = getPartialDownloadPath(download);
        deleteFile(fullpath);
        res = await httpGetPromise(download.url);
        const filename = getFilename(download.url, res.headers);
        const size = getFileSize(res.headers);
        dispatch(
          changeDownloadBasicInfo(
            id,
            filename,
            await getAvailableFilename(download.dirname, filename, downloads),
            size
          )
        );
        download = getState().downloads.find(download => download.id === id);
        fullpath = getPartialDownloadPath(download);
        stream = fs.createWriteStream(fullpath);
        dispatch(updateBytesDownloaded(id, 0));
        break;
      default:
        break;
    }
    // The download status might have changed since dispatching resumingDownload
    download = getState().downloads.find(download => download.id === id);
    if (download.status === 'resuming') {
      dispatch(resumeDownload(id, res));
      dispatch(thunkDownloadFile(id, res, stream));
    }
    return Promise.resolve();
  };
}