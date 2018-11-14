"use strict";

const Room        = require('./Room');
const Message     = require('./Message');
const User        = require("./User");

const request     = require('request');
const async       = require('async');
const xml2js      = require('xml2js');

const url         = require('url');

const md5         = require('md5');

const _           = require('lodash');

const consts = require('./consts');

const config = require("./../config.json");

const currEnv = process.env.NODE_ENV;
if(!currEnv){
    throw new Error('NODE_ENV not set');
}

var siteURL = config[currEnv].siteURL;

const _ACTION = {
    CONNECT        : 'connect',
    JOIN           : 'join',
    SEND_MESSAGE   : 'send-message',
    SET_PROPERTY   : 'set-property',
    REMOVE_PROPERTY: 'remove-property',
    CLOSE          : 'close',
    MUTE           : 'mute',
    UNMUTE         : 'unmute',
    MAKE_ADMIN     : 'make-admin',
    MAKE_VIEWER    : 'make-viewer',
    SEND_TIP       : 'send-tip',
    SET_TIP_GOAL   : 'set-tip-goal',
    GO_PRIVATE     : 'go-private',
    GO_PUBLIC      : 'go-public',
    SET_WOWZA_ID   : 'set-wowza-id',
    SET_ALLOW_GROUP_SHOW: 'set-allow-group-show',
    SET_TITLE      : 'set-title'
};

const _NOTIFICATION = {
    USER_LIST_CHANGED: 'user-list-change',
    MESSAGE_DELIVERED: 'message-delivered',
    TIPS_SENT        : 'tips-sent',
    TIP_GOAL_SET     : 'tip-goal-set',
    ROOM_IS_PRIVATE  : 'room-is-private',
    ROOM_IS_PUBLIC   : 'room-is-public',
    PROPERTY_SET     : 'property-set',
    PROPERTY_REMOVED : 'property-removed',
    WOWZA_ID_CHANGED : 'wowza-id-changed',
    ALLOW_GROUP_SHOW_CHANGED : 'allow-group-show-changed',
    TITLE_CHANGED: 'title-changed'
};

class Application {

    /**
     *
     * @return {{CONNECT: string, JOIN: string, SEND_MESSAGE: string, SET_PROPERTY: string, REMOVE_PROPERTY: string, CLOSE: string, MUTE: string, UNMUTE: string, MAKE_ADMIN: string, MAKE_VIEWER: string, SEND_TIP: string, SET_TIP_GOAL: string, GO_PRIVATE: string, GO_PUBLIC: string, SET_WOWZA_ID: string, SET_ALLOW_GROUP_SHOW: string, SET_TITLE: string}}
     */
    static get ACTION(){ return _ACTION }

    constructor() {
        /** @type {Map.<string, Room>} */
        this.rooms = new Map();

        /** @type {Map.<string, Room>} */
        this.clientUidRoomMap = new Map();

        this.messageHandlers = new Map();
        this.messageHandlers.set(Message.TYPE.PUBLIC, this.sendMessage);
        this.messageHandlers.set(Message.TYPE.PRIVATE_CHAT, this.sendMessage);
        this.messageHandlers.set(Message.TYPE.PRIVATE, this.sendPrivateMessage);
        this.messageHandlers.set(Message.TYPE.NOTIFICATION, this.sendMessage);

        this._userListChangeNotificationScheduleTask();
        this._emptyRoomsCleanupScheduleTask();
    }

    /**
     *
     * @param {WebClient} client
     * @param {string} params.roomId
     */
    connectAction(client, params) {
        var room;
        if(!this.rooms.has(params.roomId)){
            room = new Room(params.roomId);
            this.rooms.set(params.roomId, room);
        }else{
            room = this.rooms.get(params.roomId);
        }
        room.clientUids.push(client.uid);
        this.clientUidRoomMap.set(client.uid, room);
    }

    /**
     *
     * @param {WebClient} client
     * @param {string} params.id
     * @param {string} params.name
     * @param {string} params.role
     * @param {string} params.role_id
     * @param {string} params.muted
     * @param {string} params.gender
     * @param {string} params._userImagePath
     * @param {string} params.hash
     */
    joinAction(client, params) {
        var room = this.clientUidRoomMap.get(client.uid);

        if(!room){
            client.close(true);
            return;
        }

        var userHash = md5(`gender${params.gender}muted${params.muted}id${params.id}name${params.name}role${params.role}role_id${params.role_id}userImagePath${params._userImagePath}${consts.SALT}`);

        if(userHash != params.hash){
            return {
                err: "invalid params"
            }
        }

        if(params.role == User.ROLE.BROADCASTER){
            room.broadcasterName = params.name;
            room.broadcasterId = params.id;
            console.log("broadcaster connected", params.name);
        }
        
        if(params.role != User.ROLE.BROADCASTER && room.users.size == 0){
            client.close(true);
            this.clientUidRoomMap.delete(client.uid);
            return;
        }

        if(!room.users.has(client.uid)){
            delete params.hash;
            var newUser = new User(client, params);

            room.users.set(client.uid, newUser);
            if(params.id != "Guest") {
                room.usersById.set(params.id, newUser);

                room.joinedUsers.set(params.id, newUser.toObject());
                if(room.leftUsers.has(params.id)){
                    room.leftUsers.delete(params.id);
                }
            }
        }

        return {
            //items: room.items,
            clientUid: client.uid,
            userDataList: room.getUserDataList(),
            privateRoom: room.private,
            properties: room.properties,
            allowGroupShow: room.allowGroupShow,
            title: room.title
        };
    }

    /**
     *
     * @param {WebClient} client
     * @param {Room} room
     * @param {User} sender
     * @param {string} params.type
     * @param {string} params.message
     * @param {string} params.txtColor
     */
    sendMessage(client, room, sender, params) {
        var msg = new Message(room.users.get(client.uid).toObject(),
                              params.message,
                              params.type,
                              params.txtColor);
        //room.items.push(msg);

        room.users.forEach((user)=>{
            if((!sender.mute || user.userData.role == User.ROLE.ADMIN)
                && (params.type == Message.TYPE.PUBLIC || params.type == Message.TYPE.NOTIFICATION ||  user.inPrivate)) {
                    user.client.notify(_NOTIFICATION.MESSAGE_DELIVERED, msg);
            }
        });
    }

    /**
     *
     * @param {WebClient} client
     * @param {Room} room
     * @param {User} sender
     * @param {string} params.type
     * @param {string} params.message
     * @param {string} params.receiverId
     * @param {string} params.txtColor
     */
    sendPrivateMessage(client, room, sender, params) {
        var msg = new Message(room.users.get(client.uid).userData,
                              params.message,
                              Message.TYPE.PRIVATE,
                              params.txtColor);

        if(room.usersById.has(params.receiverId)){
            var user = room.usersById.get(params.receiverId);
            if(!sender.mute || user.userData.role == User.ROLE.ADMIN) {
                user.client.notify(_NOTIFICATION.MESSAGE_DELIVERED, msg);
            }
        }else{
            return {
                err: "receiver not found"
            }
        }
    }

    /**
     *
     * @param {WebClient} client
     * @param {string} params.type
     * @param {string} params.message
     * @param {string} params.receiverId
     * @param {string} params.txtColor
     */
    sendMessageAction(client, params) {
        var handler = this.messageHandlers.get(params.type);

        if(handler){
            var room = this.clientUidRoomMap.get(client.uid);
            if(!room || !room.users.has(client.uid)){
                return {
                    err: "auth error"
                };
            }
            
            if(params.message.length > 200){
                return {
                    err: "message is too long"
                }
            }
            
            var sender = room.users.get(client.uid);

            if(sender.userData.id == "Guest"){
                return {
                    err: "Guest is not able to send messages"
                }
            }

            if(room.private && !sender.inPrivate &&  params.type == Message.TYPE.PRIVATE_CHAT) {
                return {
                    err: "The user is not in private room"
                }
            }

            if (params.type == Message.TYPE.NOTIFICATION && sender.userData.role != User.ROLE.BROADCASTER) {
                return {
                    err: "Only the broadcaster is able to send notifications"
                }
            }

            var error = handler.call(this, client, room, sender, params);

            if(error){
                return {
                    err: error.err
                }
            }
        }else{
            return {
                err: "Unknown message type"
            }
        }
    }

    /**
     *
     * @param {WebClient} client
     * @param {string} params.viewerId
     */
    muteAction(client, params) {
        var room = this.clientUidRoomMap.get(client.uid);
        if(!room || !room.users.has(client.uid)){
            return {
                err: "auth error"
            };
        }
        
        var currentUser = room.users.get(client.uid);

        if(!(currentUser.userData.role == User.ROLE.BROADCASTER || currentUser.userData.role == User.ROLE.ADMIN)){
            return {
                err: 'action is not allowed'
            }
        }

        if(room.usersById.has(params.viewerId)){
            var viewer = room.usersById.get(params.viewerId);
            if(viewer.userData.role == User.ROLE.ADMIN){
                return {
                    err: "admin can't be muted"
                }
            }
            viewer.mute = true;
        }else{
            return {
                err: "viewer not found"
            }
        }
    }

    /**
     *
     * @param {WebClient} client
     * @param {string} params.viewerId
     */
    unmuteAction(client, params) {
        var room = this.clientUidRoomMap.get(client.uid);
        if(!room || !room.users.has(client.uid)){
            return {
                err: "auth error"
            };
        }
        
        var currentUser = room.users.get(client.uid);

        if(!(currentUser.userData.role == User.ROLE.BROADCASTER || currentUser.userData.role == User.ROLE.ADMIN)){
            return {
                err: 'action is not allowed'
            }
        }

        if(room.usersById.has(params.viewerId)){
            var viewer = room.usersById.get(params.viewerId);
            viewer.mute = false;
        }else{
            return {
                err: "viewer not found"
            }
        }
    }

    /**
     *
     * @param {WebClient} client
     * @param {string} params.viewerId
     */
    makeAdmin(client, params) {
        var room = this.clientUidRoomMap.get(client.uid);
        if(!room || !room.users.has(client.uid)){
            return {
                err: "auth error"
            };
        }

        var currentUser = room.users.get(client.uid);

        if(currentUser.userData.role != User.ROLE.BROADCASTER){
            return {
                err: 'action is not allowed'
            }
        }

        if(room.usersById.has(params.viewerId)){
            var viewer = room.usersById.get(params.viewerId);
            viewer.userData.role = User.ROLE.ADMIN;
        }else{
            return {
                err: "viewer not found"
            }
        }
    }

    /**
     *
     * @param {WebClient} client
     * @param {string} params.viewerId
     */
    makeViewer(client, params) {
        var room = this.clientUidRoomMap.get(client.uid);
        if(!room || !room.users.has(client.uid)){
            return {
                err: "auth error"
            };
        }

        var currentUser = room.users.get(client.uid);

        if(currentUser.userData.role != User.ROLE.BROADCASTER){
            return {
                err: 'action is not allowed'
            }
        }

        if(room.usersById.has(params.viewerId)){
            var viewer = room.usersById.get(params.viewerId);
            viewer.userData.role = User.ROLE.VIEWER;
        }else{
            return {
                err: "viewer not found"
            }
        }
    }

    /**
     *
     * @param {Room} room
     * @param {User} user
     * @param {string} tag
     * @param {string} msg
     * @private
     */
    _log(room, user, tag, msg) {
        var userData = user.userData;
        console.log(tag, msg, `
            room - ${room.id}
            broadcaster id - ${room.id}
            broadcaster name - ${room.broadcasterName}
            user id - ${userData.id}
            user name - ${userData.name}
            user role - ${userData.role}
        `)
    }

    /**
     *
     * @param {WebClient} client
     * @param {number} params.token
     * @param {string} params.viewer_id
     * @param {string} params.broadcast_id
     * @param {string} params.broadcaster_id
     * @param {string} params.sort_order1
     * @param {string} params.sort_order2
     * @param {string} params.hash1
     * @param {string} params.hash2
     */
    sendTip(client, params) {
        return new Promise((resolve, reject)=>{
            var tag = '[ACTION - send tip]';
            var tokens = parseInt(params.token);
            if(tokens <= 0){
                resolve({err: {err: "Invalid token amount"}});
                return;
            }
            var room = this.clientUidRoomMap.get(client.uid);
            if(!room || !room.users.has(client.uid)){
                resolve({err: {err: "auth error"}});
                return;
            }

            var currentUser = room.users.get(client.uid);
            if(currentUser.userData.id != params.viewer_id){
                resolve({err: {err: "Invalid params"}});
                this._log(room, currentUser, tag, "user tried to send tips with other viewer_id");
                return;
            }

            if(currentUser.tipsBlock){
                resolve({err: {err: "too many requests"}});
                this._log(room, currentUser, tag, "too many requests");
                return;
            }
            currentUser.tipsBlock = true;
            async.waterfall([
                //get balance tokens
                (next)=>{
                    request.post({
                        url: url.resolve(siteURL, consts.GET_BALANCE_TOKENS_URL) + `/?r=${Math.random()}`,
                        form: {
                            user_id: params.viewer_id,
                            sort_order: params.sort_order1,
                            hash: params.hash1
                        }
                    }, (err, res, body)=>{
                        if (!err && res.statusCode == 200){
                            next(null, body.replace("Request is not valid", ""));
                        } else {
                            next({err: "Request tokens balance error"})
                        }
                    });
                },
                //parse result extract number of available tokens
                (xmlData, next)=>{
                    try {
                        xml2js.parseString(xmlData, (err, result)=> {
                            if (!err) {
                                var availableTokens = parseInt(result.root.data[0].tokens[0]);

                                if (availableTokens >= tokens) {
                                    next(null, tokens, availableTokens)
                                } else {
                                    next({err: `Not enough tokens. Available ${availableTokens} tokens`});
                                }
                            } else {
                                next({err: "Parse xml data error"})
                            }
                        })
                    } catch(e) {
                        next({err: "Incorrect xml data"})
                    }
                },
                //send tips
                (tokens, availableTokens, next)=>{
                    request.post({
                        url: url.resolve(siteURL, consts.SEND_TIP) + `/?r=${Math.random()}`,
                        form: {
                            token: tokens,
                            viewer_id: params.viewer_id,
                            broadcast_id: params.broadcast_id,
                            broadcaster_id: params.broadcaster_id,
                            sort_order: params.sort_order2,
                            hash: params.hash2
                        }
                    }, (err, res, body)=>{
                        if (!err && res.statusCode == 200 && body.indexOf("Request is not valid") == -1) {
                            this._log(room, currentUser, tag,  `Available ${availableTokens} tokens. ${tokens} tokens sent. ${availableTokens - tokens} left`);
                            next(null)
                        } else {
                            next({err: "Request send token error"})
                        }
                    });
                }
            ], (err)=>{
                if(err) {
                    resolve({err: err});
                    this._log(room, currentUser, tag, `Error: ${err.err}`);
                }else{
                    resolve({data: {status: "success"}});
                    var currentUserObj = currentUser.toObject();
                    room.users.forEach((user)=>user.client.notify(_NOTIFICATION.TIPS_SENT, {
                        tokens: tokens,
                        senderData: currentUserObj
                    }));
                }
                currentUser.tipsBlock = false;
            });
        });
    }

    /**
     *
     * @param {WebClient} client
     * @param {number} params.tipGoal
     */
    setTipGoal(client, params) {
        var room = this.clientUidRoomMap.get(client.uid);
        if(!room || !room.users.has(client.uid)){
            return {
                err: "auth error"
            };
        }
        
        var currentUser = room.users.get(client.uid);
        if(currentUser.userData.role != User.ROLE.BROADCASTER){
            return {
                err: "action is not allowed"
            }
        }
        room.users.forEach((user)=>user.client.notify(_NOTIFICATION.TIP_GOAL_SET, {
            tipGoal: params.tipGoal,
            senderData: currentUser.toObject()
        }))
    }

    /**
     *
     * @param {WebClient} client
     * @param {Array.<string>} params.userIds
     * @param {boolean} params.privateShow
     * @param {number} params.tariff
     */
    goPrivateAction(client, params) {
        var room = this.clientUidRoomMap.get(client.uid);
        if(!room || !room.users.has(client.uid)){
            return {
                err: "auth error"
            };
        }

        if(!params.userIds){
            return {
                err: 'invalid params'
            }
        }
        
        var currentUser = room.users.get(client.uid);

        if(currentUser.userData.role != User.ROLE.BROADCASTER){
            return {
                err: 'action is not allowed'
            }
        }

        room.private = true;
        room.privateShow = !!params.privateShow;
        room.tariff = +params.tariff;
        currentUser.inPrivate = true;
        room.users.forEach((user)=>{
            if(_.includes(params.userIds, user.userData.id) || user.userData.role == User.ROLE.ADMIN){
                user.inPrivate = true;
            }
            user.client.notify(_NOTIFICATION.ROOM_IS_PRIVATE, {
                userInPrivate: user.inPrivate,
                privateShow: room.privateShow,
                tariff: room.tariff
            });
        });
    }

    /**
     *
     * @param {WebClient} client
     */
    goPublicAction(client) {
        var room = this.clientUidRoomMap.get(client.uid);
        if(!room || !room.users.has(client.uid)){
            return {
                err: "auth error"
            };
        }

        var currentUser = room.users.get(client.uid);

        if(currentUser.userData.role != User.ROLE.BROADCASTER){
            return {
                err: 'action is not allowed'
            }
        }

        room.private = false;
        room.privateShow = false;
        room.tariff = 0;

        room.users.forEach((user)=>{
            user.inPrivate = false;
            user.client.notify(_NOTIFICATION.ROOM_IS_PUBLIC, null);
        });
    }

    /**
     *
     * @param {WebClient} client
     * @param {boolean} params.allowGroupShow
     */
    setAllowGroupShow(client, params) {
        var room = this.clientUidRoomMap.get(client.uid);
        if(!room || !room.users.has(client.uid)){
            return {
                err: "auth error"
            };
        }

        var currentUser = room.users.get(client.uid);

        if(currentUser.userData.role != User.ROLE.BROADCASTER){
            return {
                err: 'action is not allowed'
            }
        }

        room.allowGroupShow = params.allowGroupShow;

        room.users.forEach((user)=>{
            user.client.notify(_NOTIFICATION.ALLOW_GROUP_SHOW_CHANGED, { allowGroupShow: room.allowGroupShow });
        });
    }

    /**
     *
     * @param {WebClient} client
     * @param {string} params.title
     * @return {*}
     */
    setTitle(client, params) {
        var room = this.clientUidRoomMap.get(client.uid);
        if(!room || !room.users.has(client.uid)){
            return {
                err: "auth error"
            };
        }

        var currentUser = room.users.get(client.uid);

        if(currentUser.userData.role != User.ROLE.BROADCASTER){
            return {
                err: 'action is not allowed'
            }
        }

        room.title = params.title;

        room.users.forEach((user)=>{
            user.client.notify(_NOTIFICATION.TITLE_CHANGED, { title: room.title });
        });
    }

    /**
     * @param {WebClient} client
     * @param {string} params.id
     */
    setWowzaId(client, params) {
        var room = this.clientUidRoomMap.get(client.uid);
        if(!room || !room.users.has(client.uid)){
            return {
                err: "auth error"
            };
        }

        var currentUser = room.users.get(client.uid);

        if(room.broadcaster){
            room.broadcaster.client.notify(_NOTIFICATION.WOWZA_ID_CHANGED, {userId: currentUser.userData.id, wowzaId: params.id});
        }
    }

    /**
     *
     * @param {WebClient} client
     * @param {string} params.property
     * @param {Object} params.value
     */
    setPropertyAction(client, params) {
        var room = this.clientUidRoomMap.get(client.uid);
        room.properties[params.property] = params.value;

        room.users.forEach((user)=>{
            if(user.client.uid !== client.uid){
                user.client.notify(_NOTIFICATION.PROPERTY_SET, {
                    property: params.property,
                    value   : params.value
                });
            }
        });
    }

    /**
     *
     * @param {WebClient} client
     * @param {string} params.property
     */
    removePropertyAction(client, params) {
        delete room.properties[params.property];

        var room = this.clientUidRoomMap.get(client.uid);
        room.users.forEach((user)=>{
            if(user.client.uid !== client.uid){
                user.client.notify(_NOTIFICATION.PROPERTY_REMOVED, {
                    property: params.property
                });
            }
        });
    }

    /**
     *
     * @private
     */
    _userListChangeNotificationScheduleTask() {
        setTimeout(function(){
            var proms = [];
            if(this.rooms.size > 0){
                this.rooms.forEach((room, roomId)=>{
                    proms.push(new Promise((resolve)=>{
                        process.nextTick(()=>{
                            if (this.rooms.has(roomId) && (room.joinedUsers.size > 0 || room.leftUsers.size > 0)) {
                                room.users.forEach((user)=> {
                                    var joinedUsers = [];
                                    room.joinedUsers.forEach((user)=>joinedUsers.push(user));

                                    var leftUsers = [];
                                    room.leftUsers.forEach((user, userId)=>leftUsers.push(userId));

                                    var usersChanges = {
                                        joinedUsers,
                                        leftUsers,
                                        numberOfUsers: room.users.size
                                    };

                                    user.client.notify(_NOTIFICATION.USER_LIST_CHANGED, usersChanges);
                                });
                                room.joinedUsers.clear();
                                room.leftUsers.clear();
                                resolve();
                            }else{
                                resolve();
                            }
                        });
                    }));
                });

                Promise.all(proms).then(()=> {
                    this._userListChangeNotificationScheduleTask();
                });
            }else{
                this._userListChangeNotificationScheduleTask();
            }
        }.bind(this), 5000);
    }

    /**
     *
     * @private
     */
    _emptyRoomsCleanupScheduleTask() {
        setTimeout(function(){
            if(this.rooms.size > 0){
                /**
                 *
                 * @type {Array.<Room>}
                 */
                var roomsToDelete = [];
                this.rooms.forEach((room)=>{
                    if(room.users.size == 0){
                        roomsToDelete.push(room);
                    }
                });
                for(let room of roomsToDelete){
                    this.rooms.delete(room.id);
                    for(let clientUid of room.clientUids){
                        this.clientUidRoomMap.delete(clientUid);
                    }
                    console.log('removed room', room.id);
                }
                this._emptyRoomsCleanupScheduleTask();
            }else{
                this._emptyRoomsCleanupScheduleTask();
            }
        }.bind(this), 10000);
    }

    /**
     *
     * @param WebClient client
     */
    closeAction(client) {
        if(this.clientUidRoomMap.has(client.uid)){
            var room = this.clientUidRoomMap.get(client.uid);

            if(room.users.has(client.uid)){
                var userToDel = room.users.get(client.uid);
                var id = userToDel.userData.id;

                room.users.delete(client.uid);
                room.usersById.delete(id);
                
                if(id != "Guest"){
                    room.leftUsers.set(id, userToDel.toObject());
                    if(room.joinedUsers.has(id)){
                        room.joinedUsers.delete(id);
                    }
                }
            }

            if(room.users.size == 0){
                this.rooms.delete(room.id);
            }

            this.clientUidRoomMap.delete(client.uid);
            //console.log(client.uid, 'closed');
        }
    }

    collectStatistics() {
        var roomIds = [];
        var numberOfUsers = 0;

        this.rooms.forEach((room)=>{
            roomIds.push(room.id);
            numberOfUsers += room.users.size;
        });

        return {
            numberOfUsers,
            roomIds
        }
    }
}

module.exports = Application;