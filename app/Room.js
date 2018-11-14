"use strict";

class Room {

    //<editor-fold desc="Properties">
    /** @returns {string|*} */
    get id(){return this._id}

    /** @returns {Map.<string, User>}  */
    get users(){return this._users}

    /** @returns {Map.<string, User>}  */
    get usersById(){return this._usersById}

    ///** @returns {Array} */
    //get items(){return this._items}

    /** @returns {Object} */
    get properties(){return this._properties}

    /** @returns {Map.<string, Object>} */
    get joinedUsers(){ return this._joinedUsers}

    /** @returns {Map.<string, Object>} */
    get leftUsers(){ return this._leftUsers}

    /** @returns {Array.<number>} */
    get clientUids() { return this._clientUids}

    /** @returns {string} */
    get broadcasterName() {return this._broadcasterName}

    /** @param {string} value */
    set broadcasterName(value) {
        this._broadcasterName = value 
    }

    /** @returns {string} */
    get broadcasterId() {return this._broadcasterId}

    /** @param {string} value */
    set broadcasterId(value) {
        this._broadcasterId = value
    }

    /** @returns {boolean} */
    get private() {
        return this._private;    
    }

    /** @param {boolean} value */
    set private(value) {
        this._private = value;
    }

    /** @return {boolean} */
    get privateShow() {
        return this._privateShow;
    }

    /** @param {boolean} value */
    set privateShow(value) {
        this._privateShow = value;
    }

    /** @return {number} */
    get tariff() {
        return this._tariff;
    }

    /** @param {number} value */
    set tariff(value) {
        this._tariff = value;
    }
    
    /** @returns {User} */
    get broadcaster() {
        return this._usersById.get(this._broadcasterId);
    }

    /** @return {boolean} */
    get allowGroupShow() {
        return this._allowGroupShow;
    }

    /** @param {boolean} value */
    set allowGroupShow(value) {
        this._allowGroupShow = value;
    }

    /** @return {string}*/
    get title() {
        return this._title;
    }

    /** @param {string} value */
    set title(value) {
        this._title = value;
    }
    //</editor-fold>
    
    /**
     *
     * @param {string} id
     */
    constructor(id) {
        this._id = id;
        this._users = new Map();
        this._usersById = new Map();
        //this._items = [];
        this._properties = {};

        /**
         *
         * @type {Map.<string, Object>}
         * @private
         */
        this._joinedUsers = new Map();

        /**
         *
         * @type {Map.<string, Object>}
         * @private
         */
        this._leftUsers = new Map();
        
        this._clientUids = [];
        
        this._broadcasterName = '';

        this._broadcasterId = '';
        
        this._private = false;

        this._privateShow = false;

        this._tariff = 0;

        this._allowGroupShow = false;

        this._title = '';
    }

    getUserDataList() {
        var userDataList = [];
        this.users.forEach((user)=>userDataList.push(user.toObject()));

        return userDataList;
    }
}

module.exports = Room;