export type SeekFunction = (time: number) => void;
export type AudioReady = {
    ready: AudioReadyDetail
};
export type AudioReadyDetail = {
    isReady: boolean,
    audioLength: number,
    seek: SeekFunction,
};
export type AudioCurrentTime = {
    currentTime: AudioCurrentTimeDetail
};
export type AudioCurrentTimeDetail = {
    currentTime: number;
}
export const placeholderSeek: SeekFunction = () => { return; };