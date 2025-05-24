// map_eva.js

/*
 1. コマンドプロンプトで、「E:」を入力
 2. パスの指定「cd "E:\2025年度\app_googlemap\map_simulation"」を入力実行
 3. サーバー開通「python -m http.server 8000」を入力実行
 4. ブラウザで「http://localhost:8000/index.html」を検索→完了 http://localhost:8000/map_hakodate/index.html

 5. コマンドプロンプトで、「コントロール＋C」でサーバー停止（コマンドプロンプトを閉じれば停止される？）
*/

// 追加：グローバル変数宣言
let map;
let directionsService;
let directionsRenderer;
let distanceMatrixService;
let startMarker = null;
let destinations = [];

function displayMessage(message) {
    document.getElementById("nearest-destination").textContent = message;
}

function initMap() {
    const center = { lat: 41.775271, lng: 140.7257441 };//41.77527119776984, 140.72574412302814
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 15,
        center: center
    });

    // 津波ポリゴンの読み込み
    map.data.loadGeoJson('./tsunami.geojson');

    // スタイル設定（薄い青色の透過ポリゴン）
    map.data.setStyle({
        fillColor: '#5c9ee7',
        fillOpacity: 0.3,
        strokeColor: '#5c9ee7',
        strokeWeight: 1,
        clickable: false  // ← ここを追加！
    });


    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();
    directionsRenderer.setMap(map);

    distanceMatrixService = new google.maps.DistanceMatrixService();

    // 避難ビル（緑）と水平避難ポイント（青）を読み込み
    loadDestinations();
    loadEvacPoints();

    map.addListener('click', function(event) {
        setStartPoint(event.latLng);
    });
}

function loadDestinations() {
    fetch('./destinations.json')
        .then(response => response.json())
        .then(data => {
            destinations = data;
            data.forEach(dest => {
                addCustomMarker(dest.location, dest.name, "#00FF00", "#008000"); // 緑
            });
        })
        .catch(error => displayMessage("避難ビルの読み込みエラー: " + error));
}

function loadEvacPoints() {
    fetch('./evac_points.json')
        .then(response => response.json())
        .then(data => {
            data.forEach(point => {
                // location を明示的に構成して追加
                const structured = {
                    name: point.name,
                    location: {
                        lat: point.location?.lat ?? point.lat,
                        lng: point.location?.lng ?? point.lng
                    }
                };
                destinations.push(structured);
                addCustomMarker(structured.location, structured.name, "#3399FF", "#0055AA", 6);
            });
            console.log("水平避難ポイント読み込み完了:", data.length);
        })
        .catch(error => displayMessage("水平避難ポイントの読み込みエラー: " + error));
}

function addCustomMarker(position, title, fillColor, strokeColor) {
    new google.maps.Marker({
        position: new google.maps.LatLng(position.lat, position.lng),
        map: map,
        title: title,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: fillColor,
            fillOpacity: 0.8,
            strokeWeight: 2,
            strokeColor: strokeColor
        }
    });
}

function addAllDestinationMarkers() {
    destinations.forEach(destination => {
        addMarker(destination.location, destination.name);
    });
}

function setStartPoint(location) {
    if (startMarker) startMarker.setMap(null);
    startMarker = new google.maps.Marker({
        position: location,
        map: map,
        title: "スタート地点"
    });
    findClosestPoint(location);
}

function findClosestPoint(origin) {
    function getDistanceInMeters(loc1, loc2) {
        const R = 6371000;
        const toRad = deg => deg * Math.PI / 180;
        const dLat = toRad(loc2.lat - loc1.lat);
        const dLng = toRad(loc2.lng - loc1.lng);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(loc1.lat)) * Math.cos(toRad(loc2.lat)) *
            Math.sin(dLng / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    const nearbyDestinations = destinations.filter(dest => {
        const distance = getDistanceInMeters(
            { lat: origin.lat(), lng: origin.lng() },
            { lat: dest.location.lat, lng: dest.location.lng }
        );
        return distance <= 700;
    });

    if (nearbyDestinations.length === 0) {
        displayMessage("700m以内に避難場所がありません。");
        directionsRenderer.setDirections({ routes: [] });
        return;
    }

    const destinationLocations = nearbyDestinations.map(dest => dest.location);

    distanceMatrixService.getDistanceMatrix(
        {
            origins: [origin],
            destinations: destinationLocations,
            travelMode: google.maps.TravelMode.WALKING,
        },
        function(response, status) {
            if (status === google.maps.DistanceMatrixStatus.OK) {
                const distances = response.rows[0].elements;
                let closestIndex = 0;
                let minDistance = distances[0].distance.value;

                for (let i = 1; i < distances.length; i++) {
                    if (distances[i].distance.value < minDistance) {
                        minDistance = distances[i].distance.value;
                        closestIndex = i;
                    }
                }

                const closestDestination = nearbyDestinations[closestIndex];
                const distanceMeters = distances[closestIndex].distance.value; // ← 常に数値（単位: m）
                displayMessage(`${closestDestination.name}（${distanceMeters} m）`);
                drawRoute(origin, closestDestination.location);
            } else {
                displayMessage("エラー: " + status);
            }
        }
    );
}

function drawRoute(origin, destination) {
    directionsService.route(
        {
            origin: origin,
            destination: destination,
            travelMode: google.maps.TravelMode.WALKING,
        },
        function(result, status) {
            if (status === google.maps.DirectionsStatus.OK) {
                directionsRenderer.setDirections(result);
            } else {
                displayMessage("経路描画エラー: " + status);
            }
        }
    );
}

function useCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                const latLng = new google.maps.LatLng(
                    position.coords.latitude,
                    position.coords.longitude
                );
                setStartPoint(latLng);
            },
            function(error) {
                displayMessage("現在地の取得に失敗しました: " + error.message);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    } else {
        displayMessage("このブラウザは位置情報をサポートしていません。");
    }
}

window.initMap = initMap;