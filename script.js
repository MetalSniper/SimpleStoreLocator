jQuery(document).ready(function($) {
    let map, markers = {}, allLocations = [];
    let searchTimeout;
    
    // Initialize map
    function initMap() {
        const mapElement = document.getElementById('store-map');
        if (!mapElement) return;
        
        const zoom = parseInt(mapElement.dataset.zoom) || 6;
        allLocations = JSON.parse(mapElement.dataset.locations || '[]');
        
        // Initialize map centered on first location or default
        const center = allLocations.length > 0 
            ? [allLocations[0].lat, allLocations[0].lng]
            : [19.4326, -99.1332]; // Mexico City default
        
        map = L.map('store-map').setView(center, zoom);
        
        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);
        
        // Add all location markers
        addAllMarkers();
    }
    
    function addAllMarkers() {
        allLocations.forEach(location => {
            addMarker(location);
        });
        
        // Fit map to show all markers if there are any
        if (allLocations.length > 0) {
            const bounds = L.latLngBounds(
                allLocations.map(loc => [loc.lat, loc.lng])
            );
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
    
    function addMarker(location) {
        const marker = L.marker([location.lat, location.lng]).addTo(map);
        
        const popupContent = `
            <div class="store-popup">
                <h3>${location.title}</h3>
                ${location.address ? `<p>${location.address}</p>` : ''}
                ${location.distance ? `<p><strong>Distance:</strong> ${location.distance} km</p>` : ''}
            </div>
        `;
        
        marker.bindPopup(popupContent);
        markers[location.id] = marker;
    }
    
    function clearMarkers() {
        Object.values(markers).forEach(marker => marker.remove());
        markers = {};
    }
    
    // Handle store item clicks (from Elementor loop)
    // YOU MUST ADD the class "map-store-item" to your Loop Item container in Elementor
    // AND add the attribute data-post-id with dynamic Post ID value
    $(document).on('click', '.map-store-item', function(e) {
        // Don't trigger if clicking a link inside the item
        if ($(e.target).is('a') || $(e.target).closest('a').length) {
            return;
        }
        
        const postId = $(this).data('post-id');
        if (!postId) return;
        
        const locationId = parseInt(postId);
        const marker = markers[locationId];
        
        if (marker) {
            map.setView(marker.getLatLng(), 15);
            marker.openPopup();
            
            // Scroll to map
            $('html, body').animate({
                scrollTop: $('#store-map').offset().top - 100
            }, 500);
        }
    });
    
    // Address autocomplete
    $('#store-address-input').on('input', function() {
        const query = $(this).val();
        
        clearTimeout(searchTimeout);
        
        if (query.length < 3) {
            $('#address-suggestions').hide().empty();
            return;
        }
        
        searchTimeout = setTimeout(function() {
            $.ajax({
                url: storeLocator.ajaxurl,
                type: 'POST',
                data: {
                    action: 'geocode_address',
                    nonce: storeLocator.nonce,
                    query: query
                },
                success: function(response) {
                    if (response.success) {
                        displaySuggestions(response.data);
                    }
                }
            });
        }, 300);
    });
    
    function displaySuggestions(suggestions) {
        const container = $('#address-suggestions');
        container.empty();
        
        if (suggestions.length === 0) {
            container.hide();
            return;
        }
        
        suggestions.forEach(function(suggestion) {
            const item = $('<div class="suggestion-item"></div>')
                .text(suggestion.display_name)
                .data('lat', suggestion.lat)
                .data('lng', suggestion.lon);
            
            item.on('click', function() {
                $('#store-address-input').val(suggestion.display_name);
                container.hide();
                searchStores(parseFloat(suggestion.lat), parseFloat(suggestion.lon));
            });
            
            container.append(item);
        });
        
        container.show();
    }
    
    // Search button
    $('#store-search-btn').on('click', function() {
        const address = $('#store-address-input').val();
        
        if (!address) {
            alert('Please enter an address');
            return;
        }
        
        // Get coordinates from first suggestion or geocode
        $.ajax({
            url: storeLocator.ajaxurl,
            type: 'POST',
            data: {
                action: 'geocode_address',
                nonce: storeLocator.nonce,
                query: address
            },
            success: function(response) {
                if (response.success && response.data.length > 0) {
                    const first = response.data[0];
                    searchStores(parseFloat(first.lat), parseFloat(first.lon));
                    $('#address-suggestions').hide();
                } else {
                    alert('Address not found. Please try again.');
                }
            }
        });
    });
    
    function searchStores(lat, lng) {
        $('#search-status').html('<p>Searching...</p>').show();
        
        $.ajax({
            url: storeLocator.ajaxurl,
            type: 'POST',
            data: {
                action: 'search_stores',
                nonce: storeLocator.nonce,
                lat: lat,
                lng: lng
            },
            success: function(response) {
                if (response.success) {
                    const locations = response.data;
                    
                    if (locations.length === 0) {
                        $('#search-status').html('<p>No stores found within 50km radius.</p>');
                        return;
                    }
                    
                    $('#search-status').html(`<p>Found ${locations.length} store(s) within 50km</p>`);
                    
                    // Update markers
                    clearMarkers();
                    locations.forEach(location => {
                        addMarker(location);
                    });
                    
                    // Fit map to show found markers
                    const bounds = L.latLngBounds(
                        locations.map(loc => [loc.lat, loc.lng])
                    );
                    map.fitBounds(bounds, { padding: [50, 50] });
                    
                    // Filter Elementor loop items
                    filterLoopItems(locations);
                    
                    // Scroll to results
                    $('html, body').animate({
                        scrollTop: $('.map-store-item:visible').first().offset().top - 100
                    }, 500);
                }
            },
            error: function() {
                $('#search-status').html('<p>Search failed. Please try again.</p>');
            }
        });
    }
    
    function filterLoopItems(locations) {
        const locationIds = locations.map(loc => loc.id);
        
        $('.map-store-item').each(function() {
            const postId = parseInt($(this).data('post-id'));
            if (!postId) return;
            
            if (locationIds.includes(postId)) {
                $(this).show();
                
                // Add distance info if available
                const location = locations.find(loc => loc.id === postId);
                if (location && location.distance) {
                    const distanceHtml = `<div class="store-distance">${location.distance} km away</div>`;
                    $(this).find('.store-distance').remove();
                    $(this).append(distanceHtml);
                }
            } else {
                $(this).hide();
            }
        });
    }
    
    // Close suggestions when clicking outside
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.store-search-container').length) {
            $('#address-suggestions').hide();
        }
    });
    
    // Initialize map when document is ready
    initMap();
});