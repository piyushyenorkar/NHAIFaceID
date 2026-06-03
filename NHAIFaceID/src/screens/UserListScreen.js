import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Image, Alert } from 'react-native';
import { getAllEnrolledFaces, getVerificationsToday, getPendingSyncLogs, purgeAllData } from '../services/localStorage';

export default function UserListScreen() {
  const [activeTab, setActiveTab] = useState('enrolled');
  const [data, setData] = useState([]);

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);

  const loadData = async (tab) => {
    try {
      if (tab === 'enrolled') {
        const res = await getAllEnrolledFaces();
        setData(res);
      } else if (tab === 'verified') {
        const res = await getVerificationsToday();
        setData(res);
      } else if (tab === 'pending') {
        const res = await getPendingSyncLogs();
        setData(res);
      }
    } catch (e) {
      console.error('Failed to load tab data', e);
    }
  };

  const handleWipe = () => {
    Alert.alert(
      "Wipe Entire Database?",
      "This will instantly delete all 9 duplicated users and all logs so you can start completely fresh. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Wipe Now", 
          style: "destructive",
          onPress: async () => {
            await purgeAllData();
            loadData(activeTab);
            Alert.alert("Success", "All test data wiped!");
          }
        }
      ]
    );
  };

  const renderEnrolledCard = ({ item }) => {
    let embeddingArray = [];
    try {
      embeddingArray = JSON.parse(item.embedding);
    } catch (e) {}

    // Support both multi-pose ensembles (2D arrays) and single embeddings (1D arrays)
    let displayArray = [];
    if (Array.isArray(embeddingArray) && Array.isArray(embeddingArray[0])) {
      displayArray = embeddingArray[0]; // Use the CENTER pose embedding
    } else if (Array.isArray(embeddingArray)) {
      displayArray = embeddingArray;
    }

    const formattedHash = displayArray.slice(0, 8).map(v => {
      const num = typeof v === 'number' ? v : parseFloat(v);
      return !isNaN(num) ? num.toFixed(3) : '0.000';
    }).join(', ');

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          {item.thumbnail_path ? (
            <Image source={{ uri: item.thumbnail_path }} style={styles.thumbnail} />
          ) : (
            <View style={[styles.thumbnail, { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={{color: '#FFF', fontSize: 10}}>No Photo</Text>
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={styles.nameText}>{item.name}</Text>
            <Text style={styles.idText}>ID: {item.employee_id}</Text>
            <Text style={styles.dateText}>Enrolled: {item.enrolled_at}</Text>
          </View>
        </View>

        <View style={styles.hashContainer}>
          <Text style={styles.hashTitle}>128-D GEOMETRIC HASH (First 8 Distances):</Text>
          <Text style={styles.hashText}>
            [{formattedHash || 'No Data'} ...]
          </Text>
        </View>
      </View>
    );
  };

  const renderLogCard = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.nameText}>Emp ID: {item.employee_id || 'UNKNOWN'}</Text>
      <Text style={[styles.idText, { color: item.matched ? '#28a745' : '#dc3545' }]}>
        Status: {item.matched ? 'MATCHED' : 'FAILED'}
      </Text>
      <Text style={styles.idText}>Confidence: {item.confidence}%</Text>
      <Text style={styles.dateText}>Time: {item.timestamp}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={{padding: 10, backgroundColor: '#003087', alignItems: 'flex-end'}}>
        <TouchableOpacity style={{backgroundColor: '#dc3545', padding: 8, borderRadius: 6}} onPress={handleWipe}>
          <Text style={{color: '#FFF', fontWeight: 'bold'}}>🗑️ Wipe All Test Data</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'enrolled' && styles.activeTab]}
          onPress={() => setActiveTab('enrolled')}
        >
          <Text style={[styles.tabText, activeTab === 'enrolled' && styles.activeTabText]}>Enrolled</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'verified' && styles.activeTab]}
          onPress={() => setActiveTab('verified')}
        >
          <Text style={[styles.tabText, activeTab === 'verified' && styles.activeTabText]}>Verified</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
          onPress={() => setActiveTab('pending')}
        >
          <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>Pending</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id.toString()}
        renderItem={activeTab === 'enrolled' ? renderEnrolledCard : renderLogCard}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={<Text style={{textAlign: 'center', marginTop: 20}}>No records found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    elevation: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#003087',
  },
  tabText: {
    color: '#666',
    fontWeight: 'bold',
  },
  activeTabText: {
    color: '#003087',
  },
  listContainer: {
    padding: 15,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 15,
  },
  cardInfo: {
    flex: 1,
  },
  nameText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  idText: {
    fontSize: 14,
    color: '#555',
    marginTop: 2,
  },
  dateText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  hashContainer: {
    backgroundColor: '#000',
    padding: 10,
    borderRadius: 6,
    marginTop: 5,
  },
  hashTitle: {
    color: '#00FF00',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  hashText: {
    color: '#00FF00',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});
