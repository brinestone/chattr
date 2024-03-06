import { Logger } from "@nestjs/common";
import { MessageBody, SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";

@WebSocketGateway()
export class AppGateway {

    private readonly logger = new Logger(AppGateway.name);

    @SubscribeMessage('init')
    handleInit(@MessageBody() json: string) {
        this.logger.verbose('init event triggered');
        return `Received: ${json}`;
    }

}