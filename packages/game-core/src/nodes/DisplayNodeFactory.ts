import { AnimatedImageNode, type AnimatedImageNodeOptions } from './AnimatedImageNode';
import { ImageNode, type ImageNodeOptions } from './ImageNode';

export class DisplayNodeFactory {
  image(options: ImageNodeOptions): ImageNode {
    return new ImageNode(options);
  }

  animatedImage(options: AnimatedImageNodeOptions): AnimatedImageNode {
    return new AnimatedImageNode(options);
  }
}
