import { animationPhase, wrap } from './animation-time.js';

// GPU只接收相机相对公里坐标。先在CPU double域合并镜头/风位移再约简，避免100000km处的厘米运动丢失。
export function cloudWindPhase(cameraKm, windKm, detail=false, time=0) {
  if(detail)return [wrap(cameraKm[0]-windKm[0]*1.6,.7),wrap(-windKm[1]*3-animationPhase(time,.004,.7),.7),wrap(cameraKm[2]-windKm[2]*1.6,.7)];
  return [wrap(cameraKm[0]-windKm[0],960),wrap(-windKm[1],7.5),wrap(cameraKm[2]-windKm[2],960)];
}
