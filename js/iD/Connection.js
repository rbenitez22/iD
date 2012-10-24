// ----------------------------------------------------------------------
// Connection base class

if (typeof iD === 'undefined') iD = {};
iD.Connection = function(apiURL) {
    // summary:		The data store, including methods to fetch data from (and, eventually, save data to)
    // an OSM API server.
    var nextNode = -1,		// next negative ids
        nextWay = -1,		//  |
        nextRelation = -1,	//  |
        entities = {},
        relations = {},
        pois = {},
        modified = false,
        apiBaseURL = apiURL;

    var connection = {};

    function assign(obj) {
        // summary:	Save an entity to the data store.
        switch (obj.entityType) {
            case "node": entities[obj.id] = obj; break;
            case "way": entities[obj.id] = obj; break;
            case "relation": relations[obj.id] = obj; break;
        }
    }

    function getOrCreate(id, type) {
        // summary:		Return an entity if it exists: if not, create an empty one with the given id, and return that.
        if (type === 'node') {
            if (!entities[id]) assign(new iD.Node(connection, id, NaN, NaN, {}, false));
            return entities[id];
        } else if (type === 'way') {
            if (!entities[id]) assign(new iD.Way(connection, id, [], {}, false));
            return entities[id];
        } else if (type === 'relation') {
            if (!relations[id]) assign(new iD.Relation(connection, id, [], {}, false));
            return relations[id];
        }
    }

    function doCreateNode(tags, lat, lon, perform) {
        // summary:		Create a new node and save it in the data store, using an undo stack.
        var node = new iD.Node(connection, nextNode--, lat, lon, tags, true);
        perform(new iD.actions.CreateEntityAction(node, assign));
        return node;	// iD.Node
    }

    function doCreateWay(tags, nodes, perform) {
        // summary:		Create a new way and save it in the data store, using an undo stack.
        var way = new iD.Way(connection, nextWay--, nodes.concat(), tags, true);
        perform(new iD.actions.CreateEntityAction(way, assign));
        return way;
    }

    function doCreateRelation(tags, members, perform) {
        // summary:		Create a new relation and save it in the data store, using an undo stack.
        var relation = new iD.Relation(connection, nextRelation--, members.concat(), tags, true);
        perform(new iD.actions.CreateEntityAction(relation, assign));
        return relation;
    }

    function getObjectsByBbox(left,right,top,bottom) {
        // summary:	Find all drawable entities that are within a given bounding box.
        // Each one is an array of entities.
        var o = {
            inside: [],
            outside: []
        };
        _.each(this.entities, function(e, id) {
            if (e.within(left, right, top, bottom)) { o.inside.push(e); }
            else { o.outside.push(e); }
        });
        return o;
    }

    // ------------
    // POI handling
    function updatePOIs(nodelist) {
        // summary:		Update the list of POIs (nodes not in ways) from a supplied array of nodes.
        _.each(nodelist, function(node) {
            if (node.entity.hasParentWays()) {
                delete pois[node._id];
            } else {
                pois[node._id] = node;
            }
        });
    }

    function getPOIs() {
        // summary:		Return a list of all the POIs in connection Connection.
        return _.values(pois);
    }

    function registerPOI(node) {
        // summary:		Register a node as a POI (not in a way).
        pois[node._id] = node;
    }

    function unregisterPOI(node) {
        // summary:		Mark a node as no longer being a POI (it's now in a way).
        delete pois[node._id];
    }

    // ----------
    // OSM parser

    function loadFromAPI(box, callback) {
        // summary:		Request data within the bbox from an external OSM server. Currently hardcoded
        // to use Overpass API (which has the relevant CORS headers).
        loadFromURL("http://www.overpass-api.de/api/xapi?map?bbox=" +
            [box[0][0], box[1][1], box[1][0], box[0][1]], callback);
    }

    function loadFromURL(url, callback) {
        // summary:		Load all data from a given URL.
        $.ajax({
            url: url,
            headers: { "X-Requested-With": null },
            success: parse(callback)
        });
    }

    function parse(callback) {
        return function(dom) {
            var nodelist = _.compact(_.map(dom.childNodes[0].childNodes, function(obj) {
                if (obj.nodeName === 'node') {
                    var node = new iD.Node(connection,
                        +getAttribute(obj, 'id'),
                        +getAttribute(obj, 'lat'),
                        +getAttribute(obj, 'lon'),
                        getTags(obj));
                    assign(node);
                    return node;
                } else if (obj.nodeName === 'way') {
                    var way = new iD.Way(connection,
                        getAttribute(obj, 'id'),
                        getNodes(obj, connection),
                        getTags(obj));
                    assign(way);
                } else if (obj.nodeName === 'relation') {
                    var relation = new iD.Relation(connection,
                        getAttribute(obj, 'id'),
                        getMembers(obj, connection),
                        getTags(obj));
                    assign(relation);
                }
            }));
            updatePOIs(nodelist);
            if (callback) { callback(nodelist); }

            // Private functions to parse DOM created from XML file
            function filterNodeName(n) {
                return function(item) { return item.nodeName === n; };
            }

            function getAttribute(obj, name) {
                return _.find(obj.attributes, filterNodeName(name)).nodeValue;
            }

            function getTags(obj) {
                return _(obj.childNodes).chain()
                .filter(filterNodeName('tag'))
                .map(function(item) {
                    return [getAttribute(item,'k'), getAttribute(item,'v')];
                }).object().value();
            }

            function getNodes(obj) {
                return _(obj.childNodes).chain()
                .filter(filterNodeName('nd'))
                .map(function(item) {
                    return entities[getAttribute(item,'ref')];
                }).value();
            }

            function getMembers(obj) {
                return _(obj.childNodes).chain()
                    .filter(filterNodeName('member'))
                    .map(function(item) {
                        var id = getAttribute(item,'ref'),
                        type = getAttribute(item,'type'),
                        role = getAttribute(item,'role');

                        var obj = getOrCreate(id,type);
                        return new iD.RelationMember(obj,role);
                    }).value();
            }
        };
    }

    connection.entities = entities;
    connection.relations = relations;
    connection.loadFromAPI = loadFromAPI;
    connection.loadFromURL = loadFromURL;
    connection.getObjectsByBbox = getObjectsByBbox;
    connection.doCreateNode = doCreateNode;
    connection.doCreateWay = doCreateWay;
    connection.doCreateRelation = doCreateRelation;
    connection.registerPOI = registerPOI;
    connection.unregisterPOI = unregisterPOI;
    connection.getPOIs = getPOIs;

    return connection;
};
